const seed = window.MeshPlanData;
let tasks = structuredClone(seed.tasks);
let activeFilter = "all";
let delayApplied = false;
let recoveryApplied = false;
let selectedTask = "T01";
let currentPage = "control";
let reservedBay = null;
let terminalFilter = "all";
let terminalNow = "09:00";
let generatedData = createFallbackGeneratedData();
let generatedDataReady = true;
const schedule = document.querySelector("#schedule");
const generatedSources = {
  containers: "data/generated-example/tos/containers.csv",
  orders: "data/generated-example/wmis/warehouse_orders.csv",
  schedule: "data/generated-example/optimizer/optimized_schedule.csv"
};

function minutesToIso(offsetHours) {
  const start = new Date("2026-06-08T06:00:00");
  start.setMinutes(start.getMinutes() + Math.round(offsetHours * 60));
  return start.toISOString().slice(0, 19);
}

function createFallbackGeneratedData() {
  const containers = seed.tasks
    .filter(task => /[A-Z]{4} \d{6}/.test(task.detail))
    .map((task, index) => {
      const containerId = task.detail.match(/[A-Z]{4} \d{6}/)[0].replace(" ", "");
      const dueOffset = task.start + 34 + index * 1.5;
      return {
        container_id: containerId,
        vessel_call_id: index < 2 ? "VESSEL-001" : "VESSEL-002",
        terminal_id: "PORT-MARIEN",
        warehouse_id: index % 2 ? "WH-02" : "WH-01",
        commodity: ["patio_furniture", "auto_parts", "appliances", "retail_general"][index % 4],
        size_teu: index % 2 ? "1" : "2",
        gross_weight_kg: String(11800 + index * 1450),
        crossdock_required: "True",
        available_time: minutesToIso(task.start),
        delivery_due: minutesToIso(dueOffset)
      };
    });
  const usefulContainers = containers.length ? containers : [
    {
      container_id: "CAXU482190",
      vessel_call_id: "VESSEL-001",
      terminal_id: "PORT-MARIEN",
      warehouse_id: "WH-01",
      commodity: "patio_furniture",
      size_teu: "2",
      gross_weight_kg: "13250",
      crossdock_required: "True",
      available_time: minutesToIso(1),
      delivery_due: minutesToIso(35)
    }
  ];
  const orders = usefulContainers.map((container, index) => ({
    order_id: `ORDER-${String(index + 1).padStart(7, "0")}`,
    container_id: container.container_id,
    warehouse_id: container.warehouse_id,
    order_type: index % 3 === 2 ? "storage" : "crossdock",
    commodity: container.commodity,
    units: String(18 + index * 7),
    customer_id: `CUSTOMER-${String(index + 1).padStart(3, "0")}`,
    delivery_due: container.delivery_due
  }));
  const scheduleRows = usefulContainers.flatMap((container, index) => {
    const release = 0.2 + index * 0.35;
    const due = container.delivery_due;
    return [
      {
        operation_id: `${container.container_id}:DISCHARGE`,
        container_id: container.container_id,
        operation_type: "terminal_discharge",
        location_id: container.terminal_id,
        resource_id: "TERMINAL_CRANES",
        planned_start: minutesToIso(release),
        planned_end: minutesToIso(release + 0.3),
        due_time: due,
        lateness_minutes: "0",
        dependencies: "[]",
        critical_path_minutes: String(320 + index * 18)
      },
      {
        operation_id: `${container.container_id}:GATE_READY`,
        container_id: container.container_id,
        operation_type: "terminal_gate_ready",
        location_id: container.terminal_id,
        resource_id: "TERMINAL_CRANES",
        planned_start: minutesToIso(release + 0.3),
        planned_end: minutesToIso(release + 0.5),
        due_time: due,
        lateness_minutes: "0",
        dependencies: `[\"${container.container_id}:DISCHARGE\"]`,
        critical_path_minutes: String(300 + index * 18)
      },
      {
        operation_id: `${container.container_id}:DRAY_IN`,
        container_id: container.container_id,
        operation_type: "drayage_import",
        location_id: "NETWORK",
        resource_id: "DRAYAGE_TRUCKS",
        planned_start: minutesToIso(release + 0.5),
        planned_end: minutesToIso(release + 2),
        due_time: due,
        lateness_minutes: index === 0 && delayApplied ? "45" : "0",
        dependencies: `[\"${container.container_id}:GATE_READY\"]`,
        critical_path_minutes: String(280 + index * 18)
      },
      {
        operation_id: `${container.container_id}:RECEIVE`,
        container_id: container.container_id,
        operation_type: "warehouse_receive",
        location_id: container.warehouse_id,
        resource_id: `${container.warehouse_id}_RECEIVING`,
        planned_start: minutesToIso(release + 2.1),
        planned_end: minutesToIso(release + 2.8),
        due_time: due,
        lateness_minutes: "0",
        dependencies: `[\"${container.container_id}:DRAY_IN\"]`,
        critical_path_minutes: String(220 + index * 18)
      },
      {
        operation_id: `${container.container_id}:CROSSDOCK`,
        container_id: container.container_id,
        operation_type: "warehouse_crossdock",
        location_id: container.warehouse_id,
        resource_id: `${container.warehouse_id}_CROSSDOCK`,
        planned_start: minutesToIso(release + 2.9),
        planned_end: minutesToIso(release + 4),
        due_time: due,
        lateness_minutes: "0",
        dependencies: `[\"${container.container_id}:RECEIVE\"]`,
        critical_path_minutes: String(180 + index * 18)
      },
      {
        operation_id: `${container.container_id}:OUTBOUND`,
        container_id: container.container_id,
        operation_type: "warehouse_outbound",
        location_id: container.warehouse_id,
        resource_id: `${container.warehouse_id}_OUTBOUND`,
        planned_start: minutesToIso(release + 4.2),
        planned_end: minutesToIso(release + 5),
        due_time: due,
        lateness_minutes: "0",
        dependencies: `[\"${container.container_id}:CROSSDOCK\"]`,
        critical_path_minutes: String(120 + index * 18)
      },
      {
        operation_id: `${container.container_id}:DRAY_OUT`,
        container_id: container.container_id,
        operation_type: "drayage_export",
        location_id: "NETWORK",
        resource_id: "DRAYAGE_TRUCKS",
        planned_start: minutesToIso(release + 5.1),
        planned_end: minutesToIso(release + 6.5),
        due_time: due,
        lateness_minutes: "0",
        dependencies: `[\"${container.container_id}:OUTBOUND\"]`,
        critical_path_minutes: String(90 + index * 18)
      }
    ];
  });
  return { containers: usefulContainers, orders, schedule: scheduleRows };
}

function timeLabel(index) {
  const hour = 7 + index;
  return `${String(hour).padStart(2, "0")}:00`;
}

function renderAxis() {
  document.querySelector("#timeAxis").innerHTML = Array.from({ length: 12 }, (_, i) => `<span>${timeLabel(i)}</span>`).join("");
}

function matchesFilter(task) {
  return activeFilter === "all" || (activeFilter === "exception" && task.exception) || (activeFilter === "unassigned" && task.unassigned);
}

function renderSchedule() {
  schedule.innerHTML = seed.lanes.map(lane => {
    const laneTasks = tasks.filter(task => task.lane === lane.id);
    const relevant = activeFilter === "all" || laneTasks.some(matchesFilter);
    const taskHtml = laneTasks.map(task => `
      <button class="task ${task.type} ${task.exception ? "exception" : ""} ${task.unassigned ? "unassigned" : ""} ${matchesFilter(task) ? "" : "filtered"} ${selectedTask === task.id ? "selected" : ""}"
        data-id="${task.id}" style="left:${task.start / 12 * 100}%;width:${task.duration / 12 * 100}%">
        <strong>${task.title}</strong><span>${task.detail}</span>
      </button>`).join("");
    return `<div class="lane ${relevant ? "" : "hidden"}"><div class="lane-label"><strong>${lane.name}</strong><span>${lane.meta}</span></div><div class="lane-track">${taskHtml}</div></div>`;
  }).join("");

  document.querySelectorAll(".task").forEach(button => button.addEventListener("click", () => {
    selectedTask = button.dataset.id;
    renderSchedule();
    renderInspector(tasks.find(task => task.id === selectedTask));
  }));
}

function renderCapacity() {
  document.querySelector("#capacityBars").innerHTML = seed.capacity.map(value =>
    `<div class="bar ${value >= 38 ? "hot" : ""}" data-value="${value}" style="height:${value / 50 * 100}%"></div>`
  ).join("");
}

function renderInspector(task) {
  const dependents = tasks.filter(item => item.dependency === task.id);
  document.querySelector("#inspectorType").textContent = task.exception ? "Exception impact" : task.unassigned ? "Carrier assignment" : "Move details";
  document.querySelector("#inspectorTitle").textContent = task.title;
  document.querySelector("#impactNumber").textContent = task.exception ? (delayApplied ? "4" : "1") : dependents.length;
  document.querySelector("#detailList").innerHTML = [
    { label: "Move ID", value: task.id, time: task.exception ? "+45m" : "On plan" },
    { label: "Resource / location", value: task.detail, time: timeLabel(Math.floor(task.start)) },
    { label: "Direct dependencies", value: dependents.length ? dependents.map(item => item.id).join(", ") : "None", time: `${dependents.length} linked` }
  ].map(item => `<div class="detail"><i class="detail-dot"></i><div><strong>${item.label}</strong><span>${item.value}</span></div><time>${item.time}</time></div>`).join("");
  document.querySelector("#recommendationText").textContent = task.unassigned
    ? "Award the lowest feasible bid that arrives before the pickup window and preserves the warehouse receiving slot."
    : "Hold Costco patio delivery, shift cross-dock to Bay 12, and protect the BBQ consolidation cutoff.";
}

function renderBids() {
  document.querySelector("#bidTable").innerHTML = seed.bids.map((bid, index) => `
    <div class="bid-row ${bid.awarded ? "awarded" : ""}">
      <div><strong>${bid.route}</strong><span>${bid.move}</span></div>
      <div><strong>${bid.carrier}</strong><span>ETA ${bid.eta}</span></div>
      <div><strong>${bid.window}</strong><span>Pickup window</span></div>
      <div><strong>${bid.price}</strong><span>All-in bid</span></div>
      <button data-bid="${index}" ${bid.awarded ? "disabled" : ""}>${bid.awarded ? "Awarded" : "Award"}</button>
    </div>`).join("");
  document.querySelectorAll("[data-bid]").forEach(button => button.addEventListener("click", () => awardBid(Number(button.dataset.bid))));
}

function renderEvents() {
  document.querySelector("#eventStream").innerHTML = seed.events.map(event =>
    `<div class="event ${event.warn ? "warn" : ""}"><time>${event.time}</time><i></i><div><strong>${event.title}</strong><span>${event.detail}</span></div></div>`
  ).join("");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some(cell => cell.length)) rows.push(row);
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
  const [headers, ...body] = rows;
  return body.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

async function loadGeneratedData() {
  if (!window.fetch) {
    renderCurrentPage();
    return;
  }
  try {
    const entries = await Promise.all(Object.entries(generatedSources).map(async ([key, path]) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      return [key, parseCsv(await response.text())];
    }));
    generatedData = Object.fromEntries(entries);
    generatedDataReady = true;
  } catch (error) {
    generatedData = generatedData.containers.length ? generatedData : createFallbackGeneratedData();
    generatedDataReady = true;
    console.error("Unable to load generated example data", error);
  }
  renderCurrentPage();
}

function generatedLoadingState(screenName) {
  return `${pageHeader(screenName, "Generated example data is loading from data/generated-example")}
    <div class="page-panel"><div class="empty-state">Loading generated schedule records...</div></div>`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (!minutes) return "On time";
  if (minutes < 60) return `${minutes}m late`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m late`;
}

function operationLabel(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function operationsByType(prefixes) {
  return generatedData.schedule.filter(row => prefixes.some(prefix => row.operation_type.startsWith(prefix)));
}

function joinContainer(row) {
  return generatedData.containers.find(container => container.container_id === row.container_id) || {};
}

function joinOrder(row) {
  return generatedData.orders.find(order => order.container_id === row.container_id) || {};
}

function renderMetricStrip(items) {
  return `<div class="screen-metrics">${items.map(item => `
    <div><span>${item.label}</span><strong>${item.value}</strong><small>${item.detail}</small></div>`).join("")}</div>`;
}

function displayContainerId(value) {
  return String(value || "").replace(/^([A-Z]{4})(\d{6,7})$/, "$1 $2");
}

function renderTosPage() {
  const containerIds = generatedData.containers.slice(0, 4).map(item => displayContainerId(item.container_id));
  const [importA = "CAXU 482190", exportA = "OOLU 729440", importB = "TEMU 338120", exportB = "MSCU 114087"] = containerIds;
  const slots = ["08:40", "08:50", "09:00", "09:10", "09:20", "09:30", "09:40", "09:50", "10:00", "10:10", "10:20"];
  const movements = [
    { id: "IMP-204", type: "import", container: importA, truck: "Tractor 42", events: [
      { time: "08:40", lane: "stack", title: "Pull from B-14", meta: "RTG-03 assigned", arrow: "right" },
      { time: "08:50", lane: "yard", title: "Stage for pickup", meta: "Zone P-02", arrow: "right" },
      { time: "09:00", lane: "gate", title: "Import pickup", meta: "Tractor 42" }
    ] },
    { id: "EXP-118", type: "export", container: exportA, truck: "Tractor 17", events: [
      { time: "09:10", lane: "gate", title: "Export drop-off", meta: "Tractor 17", arrow: "left" },
      { time: "09:20", lane: "yard", title: "Transfer to stack", meta: "Hostler H-06", arrow: "left" },
      { time: "09:30", lane: "stack", title: "Stack at E-08", meta: "Export block" }
    ] },
    { id: "DBL-031", type: "double", container: importB, secondary: exportB, truck: "Tractor 09", events: [
      { time: "09:30", lane: "stack", title: "Pull import", meta: `${importB} · C-21`, arrow: "right" },
      { time: "09:40", lane: "yard", title: "Stage import", meta: "Zone P-04", arrow: "right" },
      { time: "09:50", lane: "gate", title: "Drop + pickup", meta: "Tractor 09 · double-ended", arrow: "left" },
      { time: "10:00", lane: "yard", title: "Transfer export", meta: `${exportB} · Hostler H-02`, arrow: "left" },
      { time: "10:10", lane: "stack", title: "Stack export", meta: "D-17 · vessel cutoff 16:00" }
    ] }
  ];
  const visibleMovements = terminalFilter === "all" ? movements : movements.filter(move => move.type === terminalFilter);
  const events = visibleMovements.flatMap(move => move.events.map(event => ({ ...event, move })));
  const laneCell = (time, lane) => {
    const matches = events.filter(event => event.time === time && event.lane === lane);
    if (!matches.length) return `<div class="terminal-cell ${lane === "gate" ? "gate-slot open" : ""}">${lane === "gate" ? "<span>Open slot</span>" : ""}</div>`;
    return `<div class="terminal-cell ${lane === "gate" ? "gate-slot" : ""}">${matches.map(event => `
      <button class="terminal-event ${event.move.type}" data-terminal-move="${event.move.id}">
        <span class="event-direction ${event.arrow || ""}">${event.arrow === "right" ? "→" : event.arrow === "left" ? "←" : ""}</span>
        <strong>${event.title}</strong>
        <small>${event.meta}</small>
        <b>${event.move.id}</b>
      </button>`).join("")}</div>`;
  };
  return `${pageHeader("Terminal", "Synchronized stack, yard, and gate work in 10-minute operating slots",
    `<button class="secondary" data-action="refresh-generated">Refresh plan</button><button class="primary" data-action="advance-terminal" ${terminalNow === "09:10" ? "disabled" : ""}>${terminalNow === "09:10" ? "Now · 09:10" : "Advance to 09:10"}</button>`)}
    ${renderMetricStrip([
      { label: "Gate utilization", value: "73%", detail: "8 of 11 slots planned" },
      { label: "Import pickups", value: "4", detail: "3 staged before appointment" },
      { label: "Export drop-offs", value: "3", detail: "All within cutoff" },
      { label: "Double-ended moves", value: "1", detail: "42 min truck turn saved" }
    ])}
    <div class="terminal-toolbar">
      <div class="terminal-filters" aria-label="Movement filters">
        ${[["all", "All moves"], ["import", "Imports"], ["export", "Exports"], ["double", "Double-ended"]].map(([value, label]) =>
          `<button class="filter ${terminalFilter === value ? "active" : ""}" data-terminal-filter="${value}">${label}</button>`).join("")}
      </div>
      <div class="terminal-legend"><span><i class="import"></i>Import</span><span><i class="export"></i>Export</span><span><i class="double"></i>Double-ended</span></div>
    </div>
    <div class="terminal-scroll">
      <div class="terminal-board">
        <div class="terminal-board-head"><span>Time</span><div><strong>Container stacks</strong><small>RTG pulls and placements</small></div><div><strong>Yard pickup zone</strong><small>Hostler staging and handoff</small></div><div><strong>Gate</strong><small>10-minute truck appointments</small></div></div>
        <div class="terminal-now" style="top:${54 + slots.indexOf(terminalNow) * 72}px"><span>Now · ${terminalNow}</span></div>
        ${slots.map(time => `<div class="terminal-row ${time === terminalNow ? "current" : ""}">
          <time>${time}</time>${laneCell(time, "stack")}${laneCell(time, "yard")}${laneCell(time, "gate")}
        </div>`).join("")}
      </div>
    </div>`;
}

function renderWmsPage() {
  if (!generatedDataReady) return generatedLoadingState("WMS screen");
  const warehouseOps = operationsByType(["warehouse"]);
  const activeWarehouses = [...new Set(generatedData.orders.map(order => order.warehouse_id))];
  const crossdockOrders = generatedData.orders.filter(order => order.order_type === "crossdock");
  const totalUnits = generatedData.orders.reduce((sum, order) => sum + Number(order.units || 0), 0);
  const receiveOps = warehouseOps.filter(op => op.operation_type === "warehouse_receive");
  const byResource = warehouseOps.reduce((groups, op) => {
    groups[op.resource_id] = groups[op.resource_id] || [];
    groups[op.resource_id].push(op);
    return groups;
  }, {});
  return `${pageHeader("WMS screen", "Warehouse execution view for receiving, cross-dock, outbound staging, and customer due times",
    `<button class="secondary" data-action="reserve-bay">Reserve overflow bay</button><button class="primary" data-action="balance-bays">Rebalance dock plan</button>`)}
    ${renderMetricStrip([
      { label: "Warehouses", value: activeWarehouses.length, detail: activeWarehouses.join(" / ") },
      { label: "Orders", value: generatedData.orders.length, detail: `${crossdockOrders.length} cross-dock orders` },
      { label: "Units", value: totalUnits.toLocaleString(), detail: "Generated WMS demand" },
      { label: "Receive jobs", value: receiveOps.length, detail: "Inbound warehouse operations" }
    ])}
    <div class="ops-layout">
      <div class="page-panel">
        <div class="panel-title"><strong>Warehouse order board</strong><span>WMS order and container linkage</span></div>
        <table class="data-table ops-table">
          <thead><tr><th>Order</th><th>Container</th><th>Warehouse</th><th>Type</th><th>Units</th><th>Customer due</th></tr></thead>
          <tbody>${generatedData.orders.slice(0, 10).map(order => `<tr>
            <td><strong>${order.order_id}</strong><span>${operationLabel(order.commodity)}</span></td>
            <td>${order.container_id}</td>
            <td>${order.warehouse_id}</td>
            <td><span class="status ready">${operationLabel(order.order_type)}</span></td>
            <td>${Number(order.units).toLocaleString()}</td>
            <td>${formatDateTime(order.delivery_due)}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="page-panel">
        <div class="panel-title"><strong>Dock workload by resource</strong><span>${warehouseOps.length} generated jobs</span></div>
        <div class="dock-board">${Object.entries(byResource).map(([resource, ops]) => `
          <div class="dock-row"><div><strong>${resource}</strong><span>${ops[0].location_id}</span></div>
            <div class="dock-bar"><i style="width:${Math.min(100, ops.length * 14)}%"></i></div><b>${ops.length}</b></div>`).join("")}</div>
      </div>
    </div>`;
}

function renderTruckerPage() {
  if (!generatedDataReady) return generatedLoadingState("Trucker screen");
  const drayageOps = operationsByType(["drayage"]);
  const importMoves = drayageOps.filter(op => op.operation_type === "drayage_import");
  const exportMoves = drayageOps.filter(op => op.operation_type === "drayage_export");
  const lateMoves = drayageOps.filter(op => Number(op.lateness_minutes) > 0);
  return `${pageHeader("Trucker screen", "Carrier dispatch view for pickup windows, delivery commitments, and move acceptance",
    `<button class="secondary" data-action="refresh-market">Refresh tenders</button><button class="primary" data-action="advertise">Accept next move</button>`)}
    ${renderMetricStrip([
      { label: "Drayage moves", value: drayageOps.length, detail: `${importMoves.length} import / ${exportMoves.length} export` },
      { label: "Truck capacity", value: "5", detail: "Generated DRAYAGE_TRUCKS capacity" },
      { label: "Late moves", value: lateMoves.length, detail: "Optimizer lateness flag" },
      { label: "Open demo bids", value: tasks.filter(task => task.unassigned).length, detail: "Interactive carrier market" }
    ])}
    <div class="ops-layout">
      <div class="page-panel">
        <div class="panel-title"><strong>Dispatch tender queue</strong><span>Generated optimizer schedule</span></div>
        <div class="tender-list">${drayageOps.slice(0, 12).map(op => {
          const container = joinContainer(op);
          const order = joinOrder(op);
          return `<div class="tender-card ${Number(op.lateness_minutes) > 0 ? "alert" : ""}">
            <div><strong>${op.container_id}</strong><span>${operationLabel(op.operation_type)} · ${container.terminal_id || "NETWORK"} to ${order.warehouse_id || op.location_id}</span></div>
            <div><strong>${formatDateTime(op.planned_start)}</strong><span>${formatDateTime(op.planned_end)} finish</span></div>
            <div><strong>${operationLabel(container.commodity || "freight")}</strong><span>Due ${formatDateTime(op.due_time)}</span></div>
            <button class="mini-button" data-action="advertise">${Number(op.lateness_minutes) > 0 ? "Recover" : "Accept"}</button>
          </div>`;
        }).join("")}</div>
      </div>
      <div class="page-panel">
        <div class="panel-title"><strong>Active carrier bids</strong><span>Prototype bid workflow</span></div>
        ${seed.bids.map((bid, index) => `<div class="market-card">
          <div><strong>${bid.route}</strong><span>${bid.move} · ${bid.carrier} · ETA ${bid.eta}</span></div>
          <div class="market-price"><strong>${bid.price}</strong><span>${bid.awarded ? "Awarded" : `<button class="mini-button" data-market-bid="${index}">Award</button>`}</span></div>
        </div>`).join("")}
      </div>
    </div>`;
}

function simulateDelay() {
  if (delayApplied) return;
  delayApplied = true;
  selectedTask = "T01";
  const cascade = ["T01", "D01", "I01", "C01", "E01", "L01"];
  tasks = tasks.map(task => cascade.includes(task.id) ? { ...task, start: task.start + .75, exception: true } : task);
  document.querySelector("#scheduleSubtitle").textContent = "45-minute berth delay detected · recovery plan ready";
  document.querySelector("#onTimeMetric").textContent = "72%";
  document.querySelector("#onTimeDelta").textContent = "5 downstream moves at risk";
  document.querySelector("#riskMetric").textContent = "$12,600";
  document.querySelector("#exceptionCount").textContent = "5";
  renderSchedule();
  renderInspector(tasks.find(task => task.id === selectedTask));
}

function applyRecovery() {
  if (!delayApplied || recoveryApplied) return;
  recoveryApplied = true;
  const protectedIds = ["C01", "E01", "L01"];
  tasks = tasks.map(task => protectedIds.includes(task.id) ? { ...task, start: task.start - .4, exception: false } : task);
  document.querySelector("#scheduleSubtitle").textContent = "Optimized recovery applied · Costco windows protected";
  document.querySelector("#onTimeMetric").textContent = "89%";
  document.querySelector("#onTimeDelta").textContent = "16 of 18 moves protected";
  document.querySelector("#riskMetric").textContent = "$3,150";
  document.querySelector("#exceptionCount").textContent = "2";
  document.querySelector("#applyButton").textContent = "Recovery applied";
  document.querySelector("#applyButton").disabled = true;
  renderSchedule();
}

function awardBid(index) {
  const bid = seed.bids[index];
  seed.bids.forEach(item => { if (item.move === bid.move) item.awarded = false; });
  bid.awarded = true;
  tasks = tasks.map(task => task.id === bid.move ? { ...task, unassigned: false, detail: `${task.detail.split(" · ")[0]} · ${bid.carrier}` } : task);
  document.querySelector("#unassignedMetric").textContent = tasks.filter(task => task.unassigned).length;
  document.querySelector("#bidStatus").textContent = `${tasks.filter(task => task.unassigned).length} move open`;
  renderBids();
  renderSchedule();
  renderCurrentPage();
}

function resetScenario() {
  tasks = structuredClone(seed.tasks);
  seed.bids.forEach(bid => delete bid.awarded);
  delayApplied = false;
  recoveryApplied = false;
  selectedTask = "T01";
  activeFilter = "all";
  terminalNow = "09:00";
  document.querySelector("#scheduleSubtitle").textContent = "Terminal, truck, warehouse, cross-dock, and export plan";
  document.querySelector("#onTimeMetric").textContent = "94%";
  document.querySelector("#onTimeDelta").textContent = "17 of 18 moves protected";
  document.querySelector("#riskMetric").textContent = "$4,850";
  document.querySelector("#unassignedMetric").textContent = "2";
  document.querySelector("#exceptionCount").textContent = "1";
  document.querySelector("#bidStatus").textContent = "2 moves open";
  document.querySelector("#applyButton").textContent = "Apply optimized recovery";
  document.querySelector("#applyButton").disabled = false;
  document.querySelectorAll(".filter").forEach(button => button.classList.toggle("active", button.dataset.filter === "all"));
  renderSchedule();
  renderInspector(tasks[0]);
  renderBids();
  renderCurrentPage();
}

function taskTime(task) {
  const start = 7 + task.start;
  const end = start + task.duration;
  const format = value => {
    const totalMinutes = Math.round(value * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  };
  return `${format(start)}–${format(end)}`;
}

function pageHeader(title, subtitle, actions = "") {
  return `<div class="page-header"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></div>`;
}

function renderMasterPage() {
  const chain = ["T01", "D01", "I01", "C01", "E01", "L01"].map(id => tasks.find(task => task.id === id));
  return `${pageHeader("Master schedule", "All terminal, drayage, warehouse, cross-dock, export, and delivery work",
    `<button class="secondary" data-master-filter="risk">Show at risk</button><button class="primary" data-action="optimize">Optimize schedule</button>`)}
    <div class="page-grid">
      <div class="page-panel">
        <div class="panel-title"><strong>18 linked moves · June 03</strong><span>Dependency-aware plan</span></div>
        <table class="data-table">
          <thead><tr><th>Move</th><th>Operation</th><th>Time</th><th>Resource</th><th>Depends on</th><th>Status</th></tr></thead>
          <tbody>${tasks.map(task => `<tr data-master-row="${task.exception ? "risk" : "normal"}">
            <td><strong>${task.id}</strong><span>${task.lane}</span></td>
            <td><strong>${task.title}</strong><span>${task.detail}</span></td>
            <td>${taskTime(task)}</td>
            <td>${task.unassigned ? "Carrier needed" : task.detail.split(" · ").pop()}</td>
            <td>${task.dependency || "—"}</td>
            <td><span class="status ${task.exception ? "alert" : task.unassigned ? "" : "ready"}">${task.exception ? "At risk" : task.unassigned ? "Open" : "Planned"}</span></td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="page-panel">
        <div class="panel-title"><strong>Critical dependency chain</strong><span>CAXU 482190</span></div>
        <div class="dependency-flow">${chain.map((task, index) => `<div class="flow-step ${task.exception ? "alert" : ""}">
          <b>${index + 1}</b><div><strong>${task.title}</strong><span>${task.id} · ${taskTime(task)}</span></div><span>${task.exception ? "Risk" : "Ready"}</span>
        </div>`).join("")}</div>
      </div>
    </div>`;
}

function renderMarketPage() {
  const openMoves = tasks.filter(task => task.unassigned);
  return `${pageHeader("Carrier market", "Advertise moves, compare feasible bids, and dispatch an empty truck",
    `<button class="secondary" data-action="refresh-market">Refresh bids</button><button class="primary" data-action="advertise">Advertise pickup</button>`)}
    <div class="market-layout">
      <div class="page-panel">
        <div class="panel-title"><strong>Open pickups</strong><span>${openMoves.length} require assignment</span></div>
        ${openMoves.length ? openMoves.map(task => `<div class="market-card">
          <div><strong>${task.title}</strong><span>${task.id} · Pickup ${taskTime(task)} · ${task.detail}</span></div>
          <div class="market-price"><strong>${seed.bids.filter(b => b.move === task.id).length}</strong><span>active bids</span></div>
        </div>`).join("") : `<div class="empty-state">All advertised moves have been awarded.</div>`}
      </div>
      <div class="page-panel">
        <div class="panel-title"><strong>Feasible carrier bids</strong><span>Ranked by cost + arrival fit</span></div>
        ${seed.bids.map((bid, index) => `<div class="market-card">
          <div><strong>${bid.carrier}</strong><span>${bid.move} · ETA ${bid.eta} · ${bid.route}</span></div>
          <div class="market-price"><strong>${bid.price}</strong><span>${bid.awarded ? "Awarded" : `<button class="mini-button" data-market-bid="${index}">Award bid</button>`}</span></div>
        </div>`).join("")}
      </div>
    </div>`;
}

function renderFacilitiesPage() {
  const bays = [
    ["07", "Receiving", "CAXU 482190", "busy"], ["08", "Receiving", "OOLU 729440", "busy"],
    ["11", "Receiving", "TEMU 338120", "busy"], ["12", "Cross-dock", "Patio furniture", delayApplied ? "alert" : "busy"],
    ["14", "Cross-dock", "BBQ units", "busy"], ["15", "Cross-dock", "Calgary city-load", "busy"],
    ["Costco 01", "Dedicated door", "Patio outbound", "dedicated"], ["Costco 02", "Dedicated door", "BBQ outbound", "dedicated"],
    ["Y-21", "Yard slot", "Empty", ""], ["Y-22", "Yard slot", reservedBay === "Y-22" ? "Reserved" : "Empty", reservedBay === "Y-22" ? "busy" : ""]
  ];
  return `${pageHeader("Facilities", "Monitor the 50-slot warehouse, dedicated doors, bays, and yard capacity",
    `<button class="secondary" data-action="reserve-bay">${reservedBay ? "Release Y-22" : "Reserve Y-22"}</button><button class="primary" data-action="balance-bays">Balance bay plan</button>`)}
    <div class="page-grid">
      <div class="page-panel">
        <div class="facility-summary">
          <div><span>Active slots</span><strong>${reservedBay ? "39 / 50" : "38 / 50"}</strong></div>
          <div><span>Loading bays in use</span><strong>6 / 8</strong></div>
          <div><span>Dedicated doors</span><strong>2 / 2</strong></div>
        </div>
        <div class="panel-title"><strong>Live bay and yard map</strong><span>No overbooking detected</span></div>
        <div class="bay-grid">${bays.map(bay => `<button class="bay ${bay[3]}" data-bay="${bay[0]}"><strong>${bay[0]}</strong><span>${bay[1]}</span><span>${bay[2]}</span></button>`).join("")}</div>
      </div>
      <div class="page-panel">
        <div class="panel-title"><strong>Capacity by hour</strong><span>Hard limit: 50</span></div>
        <div class="dependency-flow">${seed.capacity.map((value, index) => `<div class="flow-step ${value >= 38 ? "alert" : ""}">
          <b>${timeLabel(index)}</b><div><strong>${value} active slots</strong><span>${50 - value} slots available</span></div><span>${Math.round(value / 50 * 100)}%</span>
        </div>`).join("")}</div>
      </div>
    </div>`;
}

function activeExceptions() {
  const base = [
    { id: "EX-101", severity: "Critical", title: "MSC Aurora berth delayed", detail: "45-minute delay affects the CAXU 482190 dependency chain.", impact: "$7,750", warning: false },
    { id: "EX-102", severity: "Warning", title: "Carrier not assigned for D02", detail: "Pickup window opens at 10:15 with active feasible bids.", impact: "$1,200", warning: true }
  ];
  if (!delayApplied) base[0] = { ...base[0], severity: "Monitor", detail: "Berth delay signal is being monitored; one move currently at risk.", impact: "$4,850", warning: true };
  if (!tasks.find(task => task.id === "D02").unassigned) return base.filter(item => item.id !== "EX-102");
  if (recoveryApplied) base[0] = { ...base[0], severity: "Contained", detail: "Recovery plan applied; two moves remain under monitoring.", impact: "$3,150", warning: true };
  return base;
}

function renderExceptionsPage() {
  const exceptions = activeExceptions();
  return `${pageHeader("Exceptions", "Prioritized disruptions and constraint violations requiring action",
    `<button class="secondary" data-action="monitor-all">Monitor all</button><button class="primary" data-action="optimize">Resolve highest impact</button>`)}
    <div class="page-grid">
      <div class="page-panel">
        <div class="panel-title"><strong>Active exception queue</strong><span>${exceptions.length} open</span></div>
        ${exceptions.map(item => `<div class="exception-card ${item.warning ? "warning" : ""}">
          <i></i><div><strong>${item.title}</strong><span>${item.id} · ${item.detail}</span></div>
          <div class="exception-meta"><b>${item.impact}</b><button class="mini-button" data-exception="${item.id}">${item.id === "EX-102" ? "Open market" : "Resolve"}</button></div>
        </div>`).join("")}
      </div>
      <div class="page-panel">
        <div class="panel-title"><strong>Casualty chain analysis</strong><span>Highest-impact path</span></div>
        <div class="dependency-flow">
          <div class="flow-step alert"><b>1</b><div><strong>Terminal discharge</strong><span>Late vessel availability</span></div><span>+45m</span></div>
          <div class="flow-step alert"><b>2</b><div><strong>Warehouse receiving</strong><span>Bay 07 arrival shifts</span></div><span>+45m</span></div>
          <div class="flow-step ${recoveryApplied ? "" : "alert"}"><b>3</b><div><strong>Cross-dock synchronization</strong><span>Slow patio flow to protect BBQ cutoff</span></div><span>${recoveryApplied ? "Held" : "Risk"}</span></div>
          <div class="flow-step ${recoveryApplied ? "" : "alert"}"><b>4</b><div><strong>Costco delivery window</strong><span>Door 01 appointment</span></div><span>${recoveryApplied ? "Protected" : "Risk"}</span></div>
        </div>
      </div>
    </div>`;
}

function renderCurrentPage() {
  const pageView = document.querySelector("#pageView");
  document.querySelector("#exceptionCount").textContent = activeExceptions().length;
  document.querySelectorAll(".control-only").forEach(element => { element.style.display = currentPage === "control" ? "" : "none"; });
  pageView.classList.toggle("active", currentPage !== "control");
  if (currentPage === "control") return;
  const renderers = {
    tos: renderTosPage,
    wms: renderWmsPage,
    trucker: renderTruckerPage,
    network: () => window.MeshPlanNetwork.template(),
    master: renderMasterPage,
    market: renderMarketPage,
    facilities: renderFacilitiesPage,
    exceptions: renderExceptionsPage
  };
  pageView.innerHTML = renderers[currentPage]();
  if (currentPage === "network") window.MeshPlanNetwork.mount();
  bindPageActions();
}

function bindPageActions() {
  document.querySelectorAll("[data-market-bid]").forEach(button => button.addEventListener("click", () => awardBid(Number(button.dataset.marketBid))));
  document.querySelectorAll("[data-exception]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.exception === "EX-102") switchPage("market");
    else { simulateDelay(); applyRecovery(); renderCurrentPage(); }
  }));
  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "optimize") { simulateDelay(); applyRecovery(); renderCurrentPage(); }
    if (action === "reserve-bay") { reservedBay = reservedBay ? null : "Y-22"; renderCurrentPage(); }
    if (action === "balance-bays") { reservedBay = "Y-22"; renderCurrentPage(); }
    if (action === "advertise") { button.textContent = "Pickup advertised"; button.disabled = true; }
    if (action === "refresh-market") { button.textContent = "Bids refreshed"; }
    if (action === "refresh-generated") { loadGeneratedData(); button.textContent = "Refreshing..."; }
    if (action === "release-holds") { button.textContent = "Released to gate"; button.disabled = true; }
    if (action === "advance-terminal") { terminalNow = "09:10"; renderCurrentPage(); }
    if (action === "monitor-all") { button.textContent = "Monitoring enabled"; }
  }));
  document.querySelectorAll("[data-terminal-filter]").forEach(button => button.addEventListener("click", () => {
    terminalFilter = button.dataset.terminalFilter;
    renderCurrentPage();
  }));
  const riskFilter = document.querySelector("[data-master-filter]");
  if (riskFilter) riskFilter.addEventListener("click", () => {
    const rows = document.querySelectorAll("[data-master-row]");
    const showingRisk = riskFilter.dataset.active === "true";
    rows.forEach(row => { row.style.display = !showingRisk && row.dataset.masterRow !== "risk" ? "none" : ""; });
    riskFilter.dataset.active = showingRisk ? "false" : "true";
    riskFilter.textContent = showingRisk ? "Show at risk" : "Show all moves";
  });
}

function switchPage(page) {
  if (currentPage === "network") window.MeshPlanNetwork.unmount();
  currentPage = page;
  document.querySelectorAll("[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelector("#delayButton").addEventListener("click", simulateDelay);
document.querySelector("#applyButton").addEventListener("click", applyRecovery);
document.querySelector("#resetButton").addEventListener("click", resetScenario);
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(item => item.classList.toggle("active", item === button));
  renderSchedule();
}));
document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));

renderAxis();
renderSchedule();
renderCapacity();
renderInspector(tasks[0]);
renderBids();
renderEvents();
renderCurrentPage();
loadGeneratedData();
