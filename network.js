const MeshPlanNetwork = (() => {
  const DATA_ROOT = "data/generated-example";
  const REQUIRED_FILES = {
    nodes: "optimizer/graph_nodes.csv",
    schedule: "optimizer/optimized_schedule.csv",
    containers: "tos/containers.csv",
    orders: "wmis/warehouse_orders.csv"
  };
  const LOCATIONS = {
    "PORT-MARIEN": { name: "Deltaport", kind: "terminal", x: 15, y: 77 },
    "WH-01": { name: "Richmond DC", kind: "warehouse", x: 39, y: 48 },
    "WH-02": { name: "Delta Cross-dock", kind: "warehouse", x: 45, y: 72 },
    "CUSTOMER-001": { name: "Vancouver", kind: "customer", x: 34, y: 28 },
    "CUSTOMER-002": { name: "Burnaby", kind: "customer", x: 48, y: 30 },
    "CUSTOMER-003": { name: "Richmond", kind: "customer", x: 37, y: 50 },
    "CUSTOMER-004": { name: "Delta", kind: "customer", x: 45, y: 72 },
    "CUSTOMER-005": { name: "Surrey", kind: "customer", x: 59, y: 61 },
    "CUSTOMER-006": { name: "Coquitlam", kind: "customer", x: 63, y: 32 },
    "CUSTOMER-007": { name: "New Westminster", kind: "customer", x: 53, y: 43 },
    "CUSTOMER-008": { name: "North Vancouver", kind: "customer", x: 40, y: 18 },
    "CUSTOMER-009": { name: "Langley", kind: "customer", x: 78, y: 62 },
    "CUSTOMER-010": { name: "Vancouver South", kind: "customer", x: 39, y: 37 },
    "CUSTOMER-011": { name: "Port Coquitlam", kind: "customer", x: 68, y: 35 },
    "CUSTOMER-012": { name: "Langley East", kind: "customer", x: 85, y: 59 },
    NETWORK: { name: "In transit", kind: "network", x: 50, y: 53 },
    "CUSTOMER-NETWORK": { name: "Customer network", kind: "network", x: 70, y: 50 }
  };
  const STAGES = [
    "terminal_discharge", "terminal_gate_ready", "drayage_import", "warehouse_receive",
    "warehouse_crossdock", "warehouse_storage_pick", "warehouse_outbound",
    "drayage_delivery", "customer_delivery"
  ];
  const COLORS = {
    terminal_discharge: "#f06432",
    terminal_gate_ready: "#f06432",
    drayage_import: "#3478b8",
    warehouse_receive: "#138a80",
    warehouse_crossdock: "#138a80",
    warehouse_storage_pick: "#138a80",
    warehouse_outbound: "#138a80",
    drayage_delivery: "#3478b8",
    customer_delivery: "#6d55a5"
  };
  let data = null;
  let selectedId = null;
  let currentTime = null;
  let playing = false;
  let timer = null;
  let filters = { commodity: "all", status: "all" };

  function template() {
    return `
      <div class="network-page">
        <div class="network-heading">
          <div><h1>Network map</h1><p>Vancouver Lower Mainland · generated schedule movement by geography</p></div>
          <div class="network-actions">
            <button class="secondary" id="networkResetView">Reset view</button>
            <label class="primary file-button">Load generated run
              <input id="networkFolderInput" type="file" webkitdirectory directory multiple>
            </label>
          </div>
        </div>
        <div class="network-notice" id="networkNotice">
          Locations are a Lower Mainland projection applied to generated location IDs. Upload a complete run folder to replace the example.
        </div>
        <div class="network-metrics" id="networkMetrics"></div>
        <div class="network-toolbar">
          <div class="network-filters">
            <label>Container<select id="containerFilter"></select></label>
            <label>Commodity<select id="commodityFilter"></select></label>
            <label>Status<select id="statusFilter">
              <option value="all">All movement</option>
              <option value="active">In transit</option>
              <option value="late">Late</option>
              <option value="complete">Completed</option>
            </select></label>
          </div>
          <div class="network-legend">
            <span><i class="legend-line planned"></i>Planned route</span>
            <span><i class="legend-dot active"></i>Active move</span>
            <span><i class="legend-dot late"></i>Late</span>
          </div>
        </div>
        <div class="network-workspace">
          <section class="geo-panel">
            <div class="geo-canvas" id="geoCanvas"></div>
            <div class="playback">
              <button class="play-button" id="networkPlay" aria-label="Play simulation">▶</button>
              <div class="playback-time"><strong id="networkTime">--</strong><span id="networkDate">--</span></div>
              <input id="networkScrubber" type="range" min="0" max="1000" value="0" aria-label="Simulation time">
              <div class="playback-speed">
                <button data-speed="1" class="active">1×</button>
                <button data-speed="4">4×</button>
                <button data-speed="12">12×</button>
              </div>
            </div>
          </section>
          <aside class="network-inspector" id="networkInspector"></aside>
        </div>
      </div>`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        row.push(value);
        value = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(value);
        if (row.some(cell => cell !== "")) rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }
    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }
    const headers = rows.shift() || [];
    return rows.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
  }

  async function loadBundledData() {
    const entries = await Promise.all(Object.entries(REQUIRED_FILES).map(async ([key, path]) => {
      const response = await fetch(`${DATA_ROOT}/${path}`);
      if (!response.ok) throw new Error(`Unable to load ${path}`);
      return [key, parseCsv(await response.text())];
    }));
    return buildDataset(Object.fromEntries(entries), "Bundled example");
  }

  async function loadFolder(files) {
    const byPath = new Map(Array.from(files).map(file => {
      const path = file.webkitRelativePath || file.name;
      return [path.replace(/^.*?(?=(optimizer|tos|wmis)\/)/, ""), file];
    }));
    const missing = Object.values(REQUIRED_FILES).filter(path => !byPath.has(path));
    if (missing.length) throw new Error(`Missing ${missing.join(", ")}`);
    const entries = await Promise.all(Object.entries(REQUIRED_FILES).map(async ([key, path]) => [
      key, parseCsv(await byPath.get(path).text())
    ]));
    return buildDataset(Object.fromEntries(entries), files[0].webkitRelativePath.split("/")[0] || "Uploaded run");
  }

  function buildDataset(raw, sourceName) {
    const scheduleByOperation = new Map(raw.schedule.map(item => [item.operation_id, {
      ...item,
      start: new Date(item.planned_start),
      end: new Date(item.planned_end),
      due: new Date(item.due_time),
      late: Number(item.lateness_minutes) > 0
    }]));
    const orders = new Map(raw.orders.map(item => [item.container_id, item]));
    const containers = raw.containers.map(item => {
      const operations = raw.nodes
        .filter(node => node.container_id === item.container_id)
        .map(node => ({ ...node, ...scheduleByOperation.get(node.operation_id) }))
        .filter(operation => operation.start instanceof Date && !Number.isNaN(operation.start))
        .sort((a, b) => a.start - b.start);
      const order = orders.get(item.container_id) || {};
      const terminal = LOCATIONS[item.terminal_id] || LOCATIONS["PORT-MARIEN"];
      const warehouse = LOCATIONS[item.warehouse_id] || LOCATIONS["WH-01"];
      const customer = LOCATIONS[order.customer_id] || LOCATIONS["CUSTOMER-001"];
      return {
        ...item,
        customerId: order.customer_id || "CUSTOMER-001",
        operations,
        points: [terminal, warehouse, customer],
        late: operations.some(operation => operation.late),
        start: operations[0]?.start,
        end: operations.at(-1)?.end
      };
    }).filter(container => container.operations.length);
    const times = containers.flatMap(container => [container.start, container.end]).filter(Boolean);
    return {
      sourceName,
      containers,
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times))
    };
  }

  function operationState(container, time) {
    const active = container.operations.find(operation => time >= operation.start && time <= operation.end);
    if (active) return { key: active.late ? "late" : "active", operation: active };
    if (time > container.end) return { key: "complete", operation: container.operations.at(-1) };
    return { key: "planned", operation: container.operations[0] };
  }

  function visibleContainers() {
    return data.containers.filter(container => {
      const state = operationState(container, currentTime).key;
      return (filters.commodity === "all" || container.commodity === filters.commodity)
        && (filters.status === "all" || state === filters.status);
    });
  }

  function pathFor(container) {
    const [terminal, warehouse, customer] = container.points;
    return `M ${terminal.x} ${terminal.y} Q ${(terminal.x + warehouse.x) / 2 - 3} ${(terminal.y + warehouse.y) / 2 - 7} ${warehouse.x} ${warehouse.y} Q ${(warehouse.x + customer.x) / 2 + 4} ${(warehouse.y + customer.y) / 2 - 8} ${customer.x} ${customer.y}`;
  }

  function pointOnRoute(container, progress) {
    const [a, b, c] = container.points;
    const segment = progress < 0.5 ? [a, b, progress * 2] : [b, c, (progress - 0.5) * 2];
    return {
      x: segment[0].x + (segment[1].x - segment[0].x) * segment[2],
      y: segment[0].y + (segment[1].y - segment[0].y) * segment[2]
    };
  }

  function routeProgress(container) {
    if (currentTime <= container.start) return 0;
    if (currentTime >= container.end) return 1;
    return (currentTime - container.start) / (container.end - container.start);
  }

  function renderMap() {
    const visible = visibleContainers();
    const facilityLocations = ["PORT-MARIEN", "WH-01", "WH-02"].map(id => ({ id, ...LOCATIONS[id] }));
    const customerIds = [...new Set(visible.map(item => item.customerId))];
    const customerLocations = customerIds.map(id => ({ id, ...(LOCATIONS[id] || LOCATIONS["CUSTOMER-001"]) }));
    const routes = visible.map(container => {
      const state = operationState(container, currentTime);
      const point = pointOnRoute(container, routeProgress(container));
      const selected = container.container_id === selectedId;
      return `
        <path class="geo-route ${state.key} ${selected ? "selected" : ""}" d="${pathFor(container)}"/>
        <circle class="container-marker ${state.key} ${selected ? "selected" : ""}" data-container="${container.container_id}"
          cx="${point.x}" cy="${point.y}" r="${selected ? 1.35 : .85}">
          <title>${container.container_id} · ${formatCommodity(container.commodity)}</title>
        </circle>`;
    }).join("");
    const nodes = [...facilityLocations, ...customerLocations].map(location => `
      <g class="geo-node ${location.kind}" data-location="${location.id}" transform="translate(${location.x} ${location.y})">
        <circle r="${location.kind === "customer" ? 1.2 : 1.8}"></circle>
        <circle class="node-ring" r="${location.kind === "customer" ? 2.3 : 3.2}"></circle>
        <text x="${location.x > 76 ? -2.8 : 2.8}" y="-1.8" text-anchor="${location.x > 76 ? "end" : "start"}">${location.name}</text>
      </g>`).join("");
    document.querySelector("#geoCanvas").innerHTML = `
      <svg class="geo-map" viewBox="0 0 100 92" role="img" aria-label="Animated drayage network across the Vancouver Lower Mainland">
        <defs>
          <pattern id="roadGrid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 0 8 L 8 0 M -2 2 L 2 -2 M 6 10 L 10 6" stroke="#dfe5e8" stroke-width=".18"/>
          </pattern>
        </defs>
        <rect width="100" height="92" fill="#eaf1f3"/>
        <path class="land" d="M6 5 L94 5 L96 83 L86 86 L81 76 L68 75 L61 82 L49 85 L38 78 L29 83 L20 72 L12 70 L8 54 L16 45 L9 33 Z"/>
        <path class="fraser" d="M8 55 C25 50 35 60 48 54 C61 48 70 52 91 43"/>
        <path class="coast" d="M7 12 C22 15 25 28 19 39 C15 47 22 56 32 59 C20 65 12 65 7 60"/>
        <rect x="7" y="5" width="89" height="80" fill="url(#roadGrid)" opacity=".55"/>
        <g class="place-labels">
          <text x="31" y="22">VANCOUVER</text><text x="48" y="25">BURNABY</text>
          <text x="33" y="45">RICHMOND</text><text x="43" y="68">DELTA</text>
          <text x="60" y="56">SURREY</text><text x="64" y="27">COQUITLAM</text><text x="78" y="55">LANGLEY</text>
        </g>
        <g class="route-layer">${routes}</g>
        <g class="node-layer">${nodes}</g>
      </svg>`;
    document.querySelectorAll("[data-container]").forEach(marker => marker.addEventListener("click", () => {
      selectedId = marker.dataset.container;
      render();
    }));
  }

  function renderMetrics() {
    const states = data.containers.map(container => operationState(container, currentTime).key);
    const active = states.filter(state => state === "active" || state === "late").length;
    const late = states.filter(state => state === "late").length;
    const inTransit = data.containers.filter(container => {
      const state = operationState(container, currentTime);
      return (state.key === "active" || state.key === "late") && state.operation.operation_type.startsWith("drayage_");
    }).length;
    const movesCompleted = data.containers.reduce((sum, container) =>
      sum + container.operations.filter(operation => operation.end < currentTime).length, 0);
    document.querySelector("#networkMetrics").innerHTML = [
      ["Active containers", active, `${data.containers.length} in ${data.sourceName}`],
      ["Moves completed", movesCompleted, `${states.filter(state => state === "complete").length} delivered`],
      ["In transit", inTransit, "on the road"],
      ["Late", late, late ? "needs attention" : "on plan"]
    ].map(([label, value, detail]) => `<div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join("");
  }

  function renderInspector() {
    const container = data.containers.find(item => item.container_id === selectedId) || data.containers[0];
    selectedId = container.container_id;
    const containerFilter = document.querySelector("#containerFilter");
    if (containerFilter) containerFilter.value = selectedId;
    const state = operationState(container, currentTime);
    const currentIndex = Math.max(0, container.operations.findIndex(operation => operation.operation_id === state.operation.operation_id));
    document.querySelector("#networkInspector").innerHTML = `
      <div class="network-inspector-head">
        <span>Selected container</span><strong>${container.container_id}</strong>
        <small>${formatCommodity(container.commodity)} · ${container.size_teu} TEU</small>
      </div>
      <div class="current-operation">
        <span>Current operation</span>
        <strong>${formatOperation(state.operation.operation_type)}</strong>
        <small>${state.operation.location_id === "NETWORK" ? `${container.points[0].name} → ${container.points[1].name}` : locationName(state.operation.location_id)}</small>
        <b class="${state.key}">${state.key === "planned" ? "Not started" : state.key}</b>
      </div>
      <div class="route-summary">
        <div><span>Origin</span><strong>${container.points[0].name}</strong></div>
        <i>→</i>
        <div><span>Via</span><strong>${container.points[1].name}</strong></div>
        <i>→</i>
        <div><span>Destination</span><strong>${container.points[2].name}</strong></div>
      </div>
      <div class="stage-list">
        ${container.operations.map((operation, index) => {
          const stageState = operation.end < currentTime ? "done" : index === currentIndex ? state.key : "future";
          return `<button class="stage ${stageState}" data-stage-time="${operation.start.toISOString()}">
            <i></i><div><strong>${formatOperation(operation.operation_type)}</strong><span>${locationName(operation.location_id)}</span></div>
            <time>${formatTime(operation.start)}</time>
          </button>`;
        }).join("")}
      </div>`;
    document.querySelectorAll("[data-stage-time]").forEach(button => button.addEventListener("click", () => {
      currentTime = new Date(button.dataset.stageTime);
      syncScrubber();
      render();
    }));
  }

  function render() {
    renderMetrics();
    renderMap();
    renderInspector();
    document.querySelector("#networkTime").textContent = formatTime(currentTime);
    document.querySelector("#networkDate").textContent = currentTime.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  }

  function setupFilters() {
    const commodities = [...new Set(data.containers.map(item => item.commodity))].sort();
    const containerSelect = document.querySelector("#containerFilter");
    containerSelect.innerHTML = data.containers.map(container =>
      `<option value="${container.container_id}">${container.container_id}</option>`).join("");
    containerSelect.value = selectedId;
    const select = document.querySelector("#commodityFilter");
    select.innerHTML = `<option value="all">All commodities</option>${commodities.map(value =>
      `<option value="${value}">${formatCommodity(value)}</option>`).join("")}`;
    select.value = filters.commodity;
  }

  function syncScrubber() {
    const progress = (currentTime - data.start) / (data.end - data.start);
    document.querySelector("#networkScrubber").value = Math.max(0, Math.min(1000, progress * 1000));
  }

  function setData(nextData) {
    data = nextData;
    selectedId = data.containers[0]?.container_id;
    currentTime = new Date(Math.min(data.end.getTime(), data.start.getTime() + 4 * 60 * 60 * 1000));
    filters = { commodity: "all", status: "all" };
    setupFilters();
    syncScrubber();
    render();
  }

  function togglePlayback() {
    playing = !playing;
    document.querySelector("#networkPlay").textContent = playing ? "❚❚" : "▶";
    if (!playing) {
      clearInterval(timer);
      timer = null;
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      currentTime = new Date(Math.min(data.end.getTime(), currentTime.getTime() + 60 * 60 * 1000));
      syncScrubber();
      render();
      togglePlayback();
      return;
    }
    const speed = Number(document.querySelector("[data-speed].active").dataset.speed);
    timer = setInterval(() => {
      currentTime = new Date(currentTime.getTime() + speed * 5 * 60 * 1000);
      if (currentTime >= data.end) {
        currentTime = new Date(data.end);
        togglePlayback();
      }
      syncScrubber();
      render();
    }, 180);
  }

  async function mount() {
    bindControls();
    try {
      setData(await loadBundledData());
    } catch (error) {
      document.querySelector("#networkNotice").textContent = `${error.message}. Serve the prototype over HTTP to load the bundled example.`;
      document.querySelector("#networkNotice").classList.add("error");
    }
  }

  function bindControls() {
    document.querySelector("#networkFolderInput").addEventListener("change", async event => {
      const notice = document.querySelector("#networkNotice");
      try {
        notice.textContent = "Reading generated run…";
        notice.classList.remove("error");
        setData(await loadFolder(event.target.files));
        notice.textContent = `${data.sourceName} loaded · ${data.containers.length} containers · geography projected to the Lower Mainland.`;
      } catch (error) {
        notice.textContent = error.message;
        notice.classList.add("error");
      }
    });
    document.querySelector("#networkPlay").addEventListener("click", togglePlayback);
    document.querySelector("#networkResetView").addEventListener("click", () => {
      currentTime = new Date(data.start);
      filters = { commodity: "all", status: "all" };
      document.querySelector("#commodityFilter").value = "all";
      document.querySelector("#statusFilter").value = "all";
      syncScrubber();
      render();
    });
    document.querySelector("#networkScrubber").addEventListener("input", event => {
      currentTime = new Date(data.start.getTime() + (data.end - data.start) * Number(event.target.value) / 1000);
      render();
    });
    document.querySelector("#commodityFilter").addEventListener("change", event => {
      filters.commodity = event.target.value;
      render();
    });
    document.querySelector("#containerFilter").addEventListener("change", event => {
      selectedId = event.target.value;
      render();
    });
    document.querySelector("#statusFilter").addEventListener("change", event => {
      filters.status = event.target.value;
      render();
    });
    document.querySelectorAll("[data-speed]").forEach(button => button.addEventListener("click", () => {
      document.querySelectorAll("[data-speed]").forEach(item => item.classList.toggle("active", item === button));
      if (playing) {
        togglePlayback();
        togglePlayback();
      }
    }));
  }

  function unmount() {
    if (timer) clearInterval(timer);
    timer = null;
    playing = false;
  }

  function formatCommodity(value) {
    return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function formatOperation(value) {
    return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function formatTime(value) {
    return value.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function locationName(id) {
    return LOCATIONS[id]?.name || id.replaceAll("-", " ");
  }

  return { template, mount, unmount };
})();

window.MeshPlanNetwork = MeshPlanNetwork;
