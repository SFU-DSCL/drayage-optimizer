window.MeshPlanData = {
  lanes: [
    { id: "terminal", name: "Marine terminal", meta: "Marien Terminal · 3 moves" },
    { id: "truck", name: "Drayage moves", meta: "Pickup + drop-off · 4 moves" },
    { id: "import", name: "Warehouse import", meta: "Receiving · 3 moves" },
    { id: "crossdock", name: "Cross-dock", meta: "Consolidation · 3 moves" },
    { id: "export", name: "Warehouse export", meta: "Outbound staging · 3 moves" },
    { id: "delivery", name: "Destination delivery", meta: "Customer windows · 2 moves" }
  ],
  tasks: [
    { id: "T01", lane: "terminal", start: 1.0, duration: 1.6, title: "MSC Aurora discharge", detail: "Marien T4 · CAXU 482190", type: "terminal", exception: true },
    { id: "T02", lane: "terminal", start: 3.0, duration: 1.1, title: "Container available", detail: "OOLU 729440 · Slot M-22", type: "terminal" },
    { id: "T03", lane: "terminal", start: 5.3, duration: 1.0, title: "Export gate-in", detail: "MSCU 114087 · Slot M-31", type: "terminal" },
    { id: "D01", lane: "truck", start: 2.8, duration: 1.5, title: "Marien → NorthPort", detail: "CAXU 482190 · Swift Haul", type: "truck", exception: true, dependency: "T01" },
    { id: "D02", lane: "truck", start: 4.2, duration: 1.3, title: "Marien → NorthPort", detail: "OOLU 729440 · Open bid", type: "truck", unassigned: true, dependency: "T02" },
    { id: "D03", lane: "truck", start: 7.2, duration: 1.4, title: "NorthPort → Marien", detail: "MSCU 114087 · Open bid", type: "truck", unassigned: true, dependency: "E02" },
    { id: "D04", lane: "truck", start: 9.4, duration: 1.3, title: "NorthPort → Costco", detail: "BBQ consolidation", type: "truck", dependency: "E03" },
    { id: "I01", lane: "import", start: 4.5, duration: 1.2, title: "Receive patio furniture", detail: "Bay 07 · CAXU 482190", type: "warehouse", exception: true, dependency: "D01" },
    { id: "I02", lane: "import", start: 5.9, duration: 1.0, title: "Receive BBQ units", detail: "Bay 08 · OOLU 729440", type: "warehouse", dependency: "D02" },
    { id: "I03", lane: "import", start: 7.6, duration: 1.0, title: "Receive accessories", detail: "Bay 11 · TEMU 338120", type: "warehouse" },
    { id: "C01", lane: "crossdock", start: 6.1, duration: 1.2, title: "Patio sort + stage", detail: "Bay 12 · Zone C", type: "warehouse", exception: true, dependency: "I01" },
    { id: "C02", lane: "crossdock", start: 7.4, duration: 1.5, title: "BBQ consolidation", detail: "Bay 14 · 3 containers", type: "warehouse", dependency: "I02" },
    { id: "C03", lane: "crossdock", start: 9.1, duration: 1.0, title: "City-load consolidation", detail: "Bay 15 · Calgary", type: "warehouse", dependency: "C02" },
    { id: "E01", lane: "export", start: 7.6, duration: 1.1, title: "Patio outbound staging", detail: "Costco Door 01", type: "warehouse", exception: true, dependency: "C01" },
    { id: "E02", lane: "export", start: 9.2, duration: 1.1, title: "Empty reposition", detail: "Export yard · MSCU 114087", type: "warehouse", dependency: "C03" },
    { id: "E03", lane: "export", start: 10.5, duration: 1.0, title: "BBQ outbound staging", detail: "Costco Door 02", type: "warehouse", dependency: "C03" },
    { id: "L01", lane: "delivery", start: 9.1, duration: 1.4, title: "Costco patio delivery", detail: "Window 16:00–17:30", type: "truck", exception: true, dependency: "E01" },
    { id: "L02", lane: "delivery", start: 11.0, duration: 0.9, title: "Costco BBQ delivery", detail: "Window 18:00–19:00", type: "truck", dependency: "D04" }
  ],
  capacity: [16, 20, 22, 27, 31, 35, 38, 36, 34, 30, 25, 18],
  bids: [
    { move: "D02", route: "Marien → NorthPort", window: "10:15–11:30", carrier: "HarborLink", price: "$425", eta: "10:05" },
    { move: "D02", route: "Marien → NorthPort", window: "10:15–11:30", carrier: "Pacific Cartage", price: "$390", eta: "10:20" },
    { move: "D03", route: "NorthPort → Marien", window: "13:15–14:45", carrier: "Coastline Trucking", price: "$360", eta: "13:05" }
  ],
  events: [
    { time: "07:24", title: "Terminal appointment confirmed", detail: "OOLU 729440 · Slot M-22" },
    { time: "07:18", title: "Warehouse capacity forecast updated", detail: "Peak raised to 38 / 50 slots" },
    { time: "07:09", title: "MSC Aurora berth delayed 45 min", detail: "CAXU 482190 dependency chain at risk", warn: true },
    { time: "06:55", title: "Carrier bid received", detail: "Pacific Cartage · $390 for D02" }
  ]
};
