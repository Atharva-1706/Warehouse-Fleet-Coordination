import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  X,
  PackagePlus,
  Bot,
  ClipboardList,
  Bell,
  BarChart3,
  Settings,
  Activity,
  Zap,
  BatteryCharging,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ============================== CONSTANTS ============================== */
const COLS = 28;
const ROWS = 18;
const CELL = 32;
const BATTERY_PER_STEP = 0.8;
const CHARGE_RATE = 1.5;
const CRITICAL_BATTERY = 25;
const SAFETY_RESERVE = 8;
const AVG_TASK_COST = 10;
const COLLECT_TICKS = 3;
const DROP_TICKS = 2;
const TASK_TIME_BASE = 2;
const TASK_TIME_PER_WEIGHT = 1;
const TWO_ROBOT_TIME_FACTOR = 0.5;
const MAX_QUEUE = 20;
const SPAWN_EVERY = 1;

const STORAGE = [
  { id: "A1", x: 4, y: 1, label: "A1" },
  { id: "A2", x: 12, y: 1, label: "A2" },
  { id: "A3", x: 20, y: 1, label: "A3" },
  { id: "B1", x: 4, y: 16, label: "B1" },
  { id: "B2", x: 12, y: 16, label: "B2" },
  { id: "B3", x: 20, y: 16, label: "B3" },
];

const INVENTORY_POS = { x: 13, y: 8 };

const CHARGE_SLOTS = [
  { x: 27, y: 4 },
  { x: 27, y: 5 },
  { x: 27, y: 6 },
  { x: 27, y: 7 },
  { x: 27, y: 8 },
  { x: 27, y: 9 },
  { x: 27, y: 10 },
  { x: 27, y: 11 },
  { x: 27, y: 12 },
  { x: 27, y: 13 },
];

const ROBOT_COLORS = ["#4FD1E8", "#B48CFF", "#B7E86B", "#FF6F6F", "#F4C550"];

const RECTS = [
  { id: "A1", label: "A1", x0: 3, x1: 5, y0: 2, y1: 4 },
  { id: "A2", label: "A2", x0: 11, x1: 13, y0: 2, y1: 4 },
  { id: "A3", label: "A3", x0: 19, x1: 21, y0: 2, y1: 4 },
  { id: "B1", label: "B1", x0: 3, x1: 5, y0: 13, y1: 15 },
  { id: "B2", label: "B2", x0: 11, x1: 13, y0: 13, y1: 15 },
  { id: "B3", label: "B3", x0: 19, x1: 21, y0: 13, y1: 15 },
];

const WALL_SET = new Set();

const OBSTACLES = [
  { id: "DRUM-1", type: "drum", x: 7, y: 5, w: 1, h: 1 },
  { id: "DRUM-2", type: "drum", x: 17, y: 6, w: 1, h: 1 },
  { id: "DRUM-3", type: "drum", x: 18, y: 11, w: 1, h: 1 },
  { id: "DRUM-4", type: "drum", x: 7, y: 12, w: 1, h: 1 },
  { id: "BOX-1", type: "box", x: 8, y: 7, w: 2, h: 1 },
  { id: "BOX-2", type: "box", x: 22, y: 6, w: 2, h: 1 },
  { id: "BOX-3", type: "box", x: 6, y: 10, w: 2, h: 1 },
  { id: "BOX-4", type: "box", x: 11, y: 11, w: 2, h: 1 },
  { id: "BOX-5", type: "box", x: 22, y: 12, w: 2, h: 1 },
  { id: "BOX-6", type: "box", x: 15, y: 8, w: 2, h: 1 },
  { id: "BOX-7", type: "box", x: 5, y: 7, w: 1, h: 2 },
  { id: "BOX-8", type: "box", x: 23, y: 9, w: 1, h: 2 },
];

OBSTACLES.forEach((o) => {
  for (let x = o.x; x < o.x + o.w; x++) {
    for (let y = o.y; y < o.y + o.h; y++) {
      WALL_SET.add(x + "," + y);
    }
  }
});

const PRIORITY_LABEL = ["", "Low", "Med", "High"];

/* ============================== PATHFINDING ============================== */
function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}
function isWall(x, y) {
  return WALL_SET.has(x + "," + y);
}
function keyOf(p) {
  return p.x + "," + p.y;
}
function shuffledDirs() {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}

function getStorageAccessPos(loc) {
  const rack = RECTS.find((r) => r.id === loc.id || r.label === loc.label);
  if (!rack) {
    return { x: loc.x, y: loc.y };
  }
  return {
    x: Math.floor((rack.x0 + rack.x1) / 2),
    y: Math.floor((rack.y0 + rack.y1) / 2),
  };
}

function bfsPathCore(start, goal, blockedSet) {
  if (start.x === goal.x && start.y === goal.y) return [];
  const goalKey = keyOf(goal);
  const q = [start];
  const cameFrom = new Map();
  const visited = new Set([keyOf(start)]);
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++];
    if (cur.x === goal.x && cur.y === goal.y) {
      const path = [];
      let c = cur;
      while (keyOf(c) !== keyOf(start)) {
        path.unshift(c);
        c = cameFrom.get(keyOf(c));
      }
      return path;
    }
    for (const d of shuffledDirs()) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (!inBounds(nx, ny) || isWall(nx, ny)) continue;
      const k = nx + "," + ny;
      if (visited.has(k)) continue;
      if (blockedSet && blockedSet.has(k) && k !== goalKey) continue;
      visited.add(k);
      cameFrom.set(k, cur);
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}
function bfsPath(start, goal) {
  return bfsPathCore(start, goal, null);
}
function bfsPathAvoiding(start, goal, blockedSet) {
  return bfsPathCore(start, goal, blockedSet);
}
function bfsDist(a, b) {
  const p = bfsPath(a, b);
  return p ? p.length : Infinity;
}

/* ============================== SIM LOGIC ============================== */
function addLog(state, text, level) {
  state.logSeq = (state.logSeq || 0) + 1;
  state.log = [{ id: state.logSeq, tick: state.tick, text, level }, ...state.log].slice(0, 60);
}

function makeTask(state, loc, weight, priority) {
  state.taskSeq = (state.taskSeq || 0) + 1;
  return {
    id: state.taskSeq,
    label: "T" + state.taskSeq,
    storagePos: getStorageAccessPos(loc),
    locLabel: loc.label,
    weight,
    priority,
    teamSize: 1,
  };
}

function getTeamWorkPositions(storagePos, locLabel) {
  const bay = RECTS.find((r) => r.label === locLabel);
  if (!bay) {
    return [
      { ...storagePos },
      { x: storagePos.x + 1, y: storagePos.y },
    ];
  }
  const cx = Math.floor((bay.x0 + bay.x1) / 2);
  const cy = Math.floor((bay.y0 + bay.y1) / 2);
  const leader = { x: cx, y: cy };
  const support = { x: Math.min(cx + 1, bay.x1), y: cy };
  if (support.x === leader.x && support.y === leader.y) {
    return [
      leader,
      { x: cx, y: Math.min(cy + 1, bay.y1) },
    ];
  }
  return [leader, support];
}

function priorityScore(robot) {
  let score = 0;
  if (robot.status === "toStorage" || robot.status === "toCharge") score += 100;
  score += (100 - robot.battery) * 0.5;
  score += (robot.stuckTicks || 0) * 5;
  return score;
}

function findFreeAdjacent(pos, robots) {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const d of dirs) {
    const nx = pos.x + d.x;
    const ny = pos.y + d.y;
    if (!inBounds(nx, ny) || isWall(nx, ny)) continue;
    const occupied = robots.some((r) => r.pos.x === nx && r.pos.y === ny);
    if (!occupied) return { x: nx, y: ny };
  }
  return null;
}

function resolveGridlock(state) {
  const robots = state.robots;
  const sidestepped = new Set();
  const THRESHOLD = 2;

  for (const robot of robots) {
    if ((robot.efficiency ?? 100) <= 0) continue;

    if (robot.currentTask?.teamSize === 2 && robot.status === "atStorage") {
      continue;
    }

    if (!robot.path || robot.path.length === 0 || !robot.destination) continue;
    if ((robot.stuckTicks || 0) < THRESHOLD) continue;

    const next = robot.path[0];
    const blocker = robots.find((r) => r.id !== robot.id && r.pos.x === next.x && r.pos.y === next.y);

    // Failed robots are permanent obstacles and can never be moved.
    if (blocker?.status === "failed") {
      continue;
    }

    // Cooperative robots actively working inside a task bay are also not moved.
    if (blocker?.currentTask?.teamSize === 2 && blocker.status === "atStorage") {
      continue;
    }

    // Idle or disabled robots do not yield.
    if (
      blocker &&
      (blocker.status === "idle" || (blocker.efficiency ?? 100) <= 0)
    ) {
      continue;
    }
    if (!blocker || sidestepped.has(blocker.id)) continue;
    if (priorityScore(robot) <= priorityScore(blocker)) continue;

    const spot = findFreeAdjacent(blocker.pos, robots);
    if (!spot) continue;

    blocker.pos = spot;
    blocker.battery = Math.max(0, +(blocker.battery - BATTERY_PER_STEP).toFixed(2));
    blocker.trail = [{ ...blocker.pos }, ...(blocker.trail || [])].slice(0, 4);
    blocker.path = (blocker.destination && bfsPath(blocker.pos, blocker.destination)) || [];
    blocker.stuckTicks = 0;
    sidestepped.add(blocker.id);

    addLog(state, `R${blocker.id} yields right-of-way to R${robot.id}`, "info");
  }
  return sidestepped;
}

function repathStuckRobots(state) {
  const STUCK_THRESHOLD = 3;
  for (const robot of state.robots) {
    if (robot.currentTask?.teamSize === 2 && robot.status === "atStorage") {
      continue;
    }
    if (!robot.path || robot.path.length === 0 || !robot.destination) continue;
    if ((robot.stuckTicks || 0) < STUCK_THRESHOLD) continue;

    const blocked = new Set(
      state.robots.filter((r) => r.id !== robot.id).map((r) => keyOf(r.pos))
    );
    const alt = bfsPathAvoiding(robot.pos, robot.destination, blocked);

    const currentNext = robot.path[0];
    const altNext = alt && alt[0];
    const isDifferentRoute =
      altNext && (altNext.x !== currentNext.x || altNext.y !== currentNext.y);

    if (alt && alt.length > 0 && isDifferentRoute) {
      robot.path = alt;
      addLog(state, `R${robot.id} rerouting around congestion`, "info");
    }
    robot.stuckTicks = 0;
  }
}

function resolveMovement(state) {
  const sidestepped = resolveGridlock(state);
  repathStuckRobots(state);

  const robots = state.robots;

  for (const robot of robots) {
    const task = robot.currentTask;
    if (task?.teamSize !== 2 || !task.workPositions) continue;
    if (robot.status !== "toStorage" && robot.status !== "atStorage") continue;

    const pos = task.workPositions[robot.id];
    if (pos) {
      robot.destination = { ...pos };
      if (robot.status === "toStorage" && robot.path.length === 0 &&
        !(robot.pos.x === pos.x && robot.pos.y === pos.y)) {
        robot.path = bfsPath(robot.pos, pos) || [];
      }
    }
  }

  const order = [...robots].sort(
    (a, b) => ((a.id + state.tick) % robots.length) - ((b.id + state.tick) % robots.length)
  );

  const reservedThisTick = new Set();
  const movedIds = new Set(sidestepped);

  for (const robot of robots) {
    if (robot.currentTask?.teamSize !== 2) continue;
    if (!robot.destination) continue;
    if (robot.status === "atStorage") {
      reservedThisTick.add(keyOf(robot.destination));
    }
  }

  for (const robot of order) {
    if (sidestepped.has(robot.id)) continue;
    if (!robot.path || robot.path.length === 0) continue;

    const efficiency = Math.max(0, Math.min(100, robot.efficiency ?? 100));
    if (efficiency <= 0) continue;

    robot.moveAccumulator = (robot.moveAccumulator || 0) + efficiency / 100;
    if (robot.moveAccumulator < 1) continue;
    robot.moveAccumulator -= 1;

    const next = robot.path[0];
    const nextKey = next.x + "," + next.y;

    const ownTeamDestination =
      robot.currentTask?.teamSize === 2 &&
      robot.destination &&
      robot.destination.x === next.x &&
      robot.destination.y === next.y;

    if (reservedThisTick.has(nextKey) && !ownTeamDestination) continue;

    const blocker = robots.find((r) => r.id !== robot.id && r.pos.x === next.x && r.pos.y === next.y);
    if (blocker) continue;

    robot.pos = { x: next.x, y: next.y };
    robot.path = robot.path.slice(1);
    robot.battery = Math.max(0, +(robot.battery - BATTERY_PER_STEP).toFixed(2));
    robot.trail = [{ ...robot.pos }, ...(robot.trail || [])].slice(0, 4);
    reservedThisTick.add(nextKey);
    movedIds.add(robot.id);
  }

  for (const robot of robots) {
    if ((robot.efficiency ?? 100) <= 0) {
      robot.stuckTicks = 0;
      continue;
    }
    if (!robot.path || robot.path.length === 0) {
      robot.stuckTicks = 0;
      continue;
    }
    robot.stuckTicks = movedIds.has(robot.id) ? 0 : (robot.stuckTicks || 0) + 1;
  }
}

function processStateMachine(state) {
  for (const robot of state.robots) {
    const atDest =
      robot.destination &&
      robot.pos.x === robot.destination.x &&
      robot.pos.y === robot.destination.y &&
      robot.path.length === 0;

    if (robot.status === "toStorage" && atDest) {
      robot.status = "atStorage";
      const task = robot.currentTask;
      const taskWeight = task?.weight || 1;
      const normalTaskTime = TASK_TIME_BASE + taskWeight * TASK_TIME_PER_WEIGHT;

      if (task?.teamSize === 2) {
        if (!task.teamAtStorage) task.teamAtStorage = [];

        const assignedWorkPos = task.workPositions?.[robot.id];
        const physicallyAtWorkPos =
          assignedWorkPos &&
          robot.pos.x === assignedWorkPos.x &&
          robot.pos.y === assignedWorkPos.y;

        if (physicallyAtWorkPos && !task.teamAtStorage.includes(robot.id)) {
          task.teamAtStorage.push(robot.id);
        }

        robot.timer = 0;

        if (task.teamAtStorage.length === task.teamMembers.length && !task.teamWorkStarted) {
          task.teamWorkStarted = true;
          task.teamWorkRemaining = Math.max(1, Math.ceil(normalTaskTime * TWO_ROBOT_TIME_FACTOR));
        }

        addLog(
          state,
          task.teamAtStorage.length === task.teamMembers.length
            ? `Team ${task.teamMembers.map((id) => `R${id}`).join(" + ")} assembled at ${task.locLabel} — starting cooperative work`
            : `R${robot.id} reached ${task.locLabel} — waiting for teammate`,
          "info"
        );
      } else {
        robot.timer = normalTaskTime;
        addLog(
          state,
          `R${robot.id} reached ${task?.locLabel || "storage"} — processing w${taskWeight} task for ${robot.timer} ticks`,
          "info"
        );
      }
    } else if (robot.status === "toInventory" && atDest) {
      robot.status = "atInventory";
      robot.timer = DROP_TICKS;
      addLog(state, `R${robot.id} reached Inventory — dropping off`, "info");
    } else if (robot.status === "toCharge" && atDest) {
      robot.status = "charging";
      addLog(state, `R${robot.id} docked at charger`, "warn");
    }

    if (robot.status === "atStorage") {
      const task = robot.currentTask;

      if (task?.teamSize === 2) {
        const allTeamMembersAtWorkPositions = task.teamMembers.every((id) => {
          const member = state.robots.find((r) => r.id === id);
          const pos = task.workPositions?.[id];
          return (
            member &&
            member.currentTask?.id === task.id &&
            member.status === "atStorage" &&
            pos &&
            member.pos.x === pos.x &&
            member.pos.y === pos.y
          );
        });

        if (!allTeamMembersAtWorkPositions || !task.teamAtStorage || task.teamAtStorage.length < task.teamMembers.length) {
          robot.timer = 0;
          continue;
        }

        if (task.teamWorkStarted) {
          if (task.teamWorkLastTick !== state.tick) {
            task.teamWorkLastTick = state.tick;
            task.teamWorkRemaining = Math.max(0, (task.teamWorkRemaining || 0) - 1);
          }

          if (task.teamWorkRemaining > 0) {
            continue;
          }

          for (const id of task.teamMembers) {
            const member = state.robots.find((r) => r.id === id);
            if (!member || member.currentTask?.id !== task.id) continue;
            member.destination = { ...INVENTORY_POS };
            member.path = bfsPath(member.pos, INVENTORY_POS) || [];
            member.status = "toInventory";
            member.tripPhase = "dropoff";
            member.timer = 0;
          }

          addLog(
            state,
            `Team ${task.teamMembers.map((id) => `R${id}`).join(" + ")} completed work at ${task.locLabel} — returning together to Inventory`,
            "info"
          );

          continue;
        }
        continue;
      }

      robot.timer -= 1;
      if (robot.timer <= 0) {
        robot.destination = { ...INVENTORY_POS };
        robot.path = bfsPath(robot.pos, INVENTORY_POS) || [];
        robot.status = "toInventory";
        robot.tripPhase = "dropoff";
      }
    } else if (robot.status === "atInventory") {
      robot.timer -= 1;
      if (robot.timer <= 0) {
        if (robot.tripPhase === "pickup") {
          if (robot.currentTask) {
            robot.destination = {
              ...(robot.currentTask.workPositions?.[robot.id] || robot.currentTask.storagePos)
            };
            robot.path = bfsPath(robot.pos, robot.destination) || [];
            robot.status = "toStorage";
            robot.tripPhase = "delivery";
            addLog(
              state,
              `R${robot.id} picked up ${robot.currentTask.label} — heading to ${robot.currentTask.locLabel}`,
              "info"
            );
          }
        } else if (robot.tripPhase === "dropoff") {
          const done = robot.currentTask;

          if (done?.teamSize === 2) {
            if (!done.teamAtInventory.includes(robot.id)) {
              done.teamAtInventory.push(robot.id);
            }

            if (done.teamAtInventory.length < done.teamMembers.length) {
              robot.timer = 1;
              continue;
            }

            if (!done.completed) {
              done.completed = true;
              state.stats.completed += 1;
              addLog(
                state,
                `${done.label} completed by ${done.teamMembers.map((id) => `R${id}`).join(" + ")} (2-robot task, w${done.weight})`,
                "success"
              );
              addLog(
                state,
                `Team ${done.teamMembers.map((id) => `R${id}`).join(" + ")} returning to charging`,
                "info"
              );

              for (const id of done.teamMembers) {
                const member = state.robots.find((r) => r.id === id);
                if (!member) continue;
                member.workload = Math.max(0, member.workload - done.weight);
                member.currentTask = null;
                member.tripPhase = null;
                member.teamRole = null;
                member.timer = 0;

                const slot = pickChargeSlot(state, member.id);
                if (slot) {
                  member.destination = { ...slot };
                  member.path = bfsPath(member.pos, slot) || [];
                  member.status = "toCharge";
                } else {
                  member.destination = null;
                  member.path = [];
                  member.status = "idle";
                }
              }
            }
            continue;
          }

          if (done) {
            robot.workload = Math.max(0, robot.workload - done.weight);
            state.stats.completed += 1;
            addLog(state, `${done.label} completed by R${robot.id} (weight ${done.weight})`, "success");
          }

          robot.currentTask = null;
          robot.tripPhase = null;

          if (robot.pendingTasks.length > 0) {
            const nextTask = robot.pendingTasks[0];
            robot.pendingTasks = robot.pendingTasks.slice(1);
            robot.currentTask = nextTask;
            robot.tripPhase = "pickup";
            robot.timer = COLLECT_TICKS;
            addLog(state, `R${robot.id} assigned next task ${nextTask.label} — picking up at Inventory`, "info");
          } else {
            const slot = pickChargeSlot(state, robot.id);
            if (slot) {
              robot.destination = { ...slot };
              robot.path = bfsPath(robot.pos, slot) || [];
              robot.status = "toCharge";
              addLog(state, `R${robot.id} returning to charge`, "warn");
            } else {
              robot.destination = null;
              robot.path = [];
              robot.status = "idle";
              addLog(state, `R${robot.id} waiting for a charging slot`, "warn");
            }
            addLog(state, `R${robot.id} has no pending tasks — returning to charge`, "info");
          }
        }
      }
    } else if (robot.status === "charging") {
      robot.battery = Math.min(100, +(robot.battery + CHARGE_RATE).toFixed(2));
      if (robot.battery >= 100) {
        robot.status = "idle";
        robot.destination = null;
        addLog(state, `R${robot.id} fully charged — rejoining fleet`, "success");
      }
    }
  }
}

function pickChargeSlot(state, robotId = null) {
  const occupied = new Set(
    state.robots.filter((r) => r.id !== robotId).map((r) => `${r.pos.x},${r.pos.y}`)
  );
  const reserved = new Set(
    state.robots.filter((r) => r.id !== robotId && r.destination).map((r) => `${r.destination.x},${r.destination.y}`)
  );
  const free = CHARGE_SLOTS.find((slot) => {
    const key = `${slot.x},${slot.y}`;
    return !occupied.has(key) && !reserved.has(key);
  });
  return free || null;
}

function handleLowBattery(state, robot) {
  const tasks = [...(robot.currentTask ? [robot.currentTask] : []), ...robot.pendingTasks];

  if (tasks.length > 0) {
    const candidates = state.robots.filter(
      (r) =>
        r.id !== robot.id &&
        r.status !== "failed" &&
        r.status !== "toCharge" &&
        r.status !== "charging" &&
        r.efficiency > 0 &&
        r.battery > 45
    );

    if (candidates.length > 0) {
      const best = [...candidates].sort(
        (a, b) => a.workload - b.workload || b.battery - a.battery || a.id - b.id
      )[0];
      const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);

      if (!best.currentTask && best.status === "idle") {
        const firstTask = tasks[0];
        best.currentTask = firstTask;
        best.pendingTasks = tasks.slice(1);
        best.workload += totalWeight;
        best.destination = { ...INVENTORY_POS };
        best.path = bfsPath(best.pos, INVENTORY_POS) || [];
        best.status = "toInventory";
        best.tripPhase = "pickup";
      } else {
        best.pendingTasks = [...best.pendingTasks, ...tasks];
        best.workload += totalWeight;
      }

      state.stats.handovers += 1;
      addLog(
        state,
        `Handover: R${robot.id} → R${best.id} (${tasks.length} task${tasks.length > 1 ? "s" : ""}, battery ${robot.battery.toFixed(0)}%)`,
        "warn"
      );
    } else {
      state.taskQueue = [...state.taskQueue, ...tasks];
      addLog(state, `R${robot.id} critical battery — ${tasks.length} task(s) returned to queue`, "danger");
    }
  }

  robot.currentTask = null;
  robot.pendingTasks = [];
  robot.workload = 0;
  const slot = pickChargeSlot(state, robot.id);
  robot.destination = { ...slot };
  robot.path = bfsPath(robot.pos, slot) || [];
  robot.status = "toCharge";
  addLog(state, `R${robot.id} returning to charge (${robot.battery.toFixed(0)}%)`, "warn");
}

function monitorBattery(state) {
  for (const robot of state.robots) {
    if (robot.status === "toCharge" || robot.status === "charging") continue;

    if (
      robot.currentTask?.teamSize === 2 &&
      (robot.status === "toInventory" || robot.status === "atInventory" || robot.status === "toStorage" || robot.status === "atStorage")
    ) {
      continue;
    }

    const nearestSlotDist = Math.min(...CHARGE_SLOTS.map((s) => bfsDist(robot.pos, s)));
    const pendingCount = (robot.currentTask ? 1 : 0) + robot.pendingTasks.length;
    const required = Math.max(
      CRITICAL_BATTERY,
      nearestSlotDist * BATTERY_PER_STEP * 1.5 + SAFETY_RESERVE + pendingCount * AVG_TASK_COST * 0.35
    );

    if (robot.battery <= required) {
      handleLowBattery(state, robot);
    }
  }
}

function maybeSpawnTask(state, bias) {
  if (state.tick % SPAWN_EVERY === 0 && state.taskQueue.length < MAX_QUEUE) {
    const loc = STORAGE[Math.floor(Math.random() * STORAGE.length)];
    const wRoll = Math.random();
    const weight = bias === "heavy" ? 5 + Math.floor(Math.random() * 6) : 1 + Math.floor(wRoll * 10);
    const pRoll = Math.random();
    const priority = bias === "urgent" ? (pRoll < 0.55 ? 3 : pRoll < 0.85 ? 2 : 1) : pRoll < 0.15 ? 3 : pRoll < 0.5 ? 2 : 1;
    const task = makeTask(state, loc, weight, priority);
    state.taskQueue = [...state.taskQueue, task];
    addLog(state, `New task queued: ${task.label} @ ${loc.label} (w${weight}, ${PRIORITY_LABEL[priority]})`, "info");
  }
}

function dispatchTasks(state) {
  if (state.taskQueue.length === 0) return;

  const sorted = [...state.taskQueue].sort((a, b) => b.priority - a.priority || b.weight - a.weight);
  const assignedRobotIds = new Set();
  const assignedTaskIds = new Set();

  const busyLocations = new Set(
    state.robots.filter((r) => r.currentTask).map((r) => r.currentTask.locLabel)
  );

  for (const task of sorted) {
    if (busyLocations.has(task.locLabel)) continue;

    const teamSize = task.teamSize === 2 ? 2 : 1;
    const available = state.robots
      .filter((r) => r.status === "idle" && !r.currentTask && !assignedRobotIds.has(r.id) && (r.efficiency ?? 100) > 0)
      .sort((a, b) => a.workload - b.workload || bfsDist(a.pos, INVENTORY_POS) - bfsDist(b.pos, INVENTORY_POS));

    if (available.length < teamSize) continue;

    const team = available.slice(0, teamSize);
    task.assignedTo = team.map((r) => r.id);
    task.teamMembers = team.map((r) => r.id);
    task.teamAtStorage = [];
    task.teamAtInventory = [];
    task.teamWorkStarted = false;
    task.teamWorkRemaining = 0;
    task.teamWorkLastTick = -1;
    task.completed = false;
    task.workPositions = {};

    const leader = team[0];
    const workPositions = getTeamWorkPositions(task.storagePos, task.locLabel);
    task.workPositions[leader.id] = { ...workPositions[0] };
    if (teamSize === 2) {
      task.workPositions[team[1].id] = { ...workPositions[1] };
    }

    for (const robot of team) {
      robot.currentTask = task;
      robot.workload += task.weight;
      robot.destination = { ...INVENTORY_POS };
      robot.path = bfsPath(robot.pos, INVENTORY_POS) || [];
      robot.status = "toInventory";
      robot.tripPhase = "pickup";
      robot.teamRole = teamSize === 2 ? (robot.id === leader.id ? "leader" : "support") : "solo";
      assignedRobotIds.add(robot.id);
    }

    assignedTaskIds.add(task.id);
    busyLocations.add(task.locLabel);

    addLog(
      state,
      `${task.label} → ${team.map((r) => `R${r.id}`).join(" + ")} dispatched (${teamSize}-robot task, w${task.weight})`,
      "info"
    );
  }

  if (assignedTaskIds.size > 0) {
    state.taskQueue = state.taskQueue.filter((t) => !assignedTaskIds.has(t.id));
  }
}

function findLeastLoadedRobot(state, sourceId) {
  const candidates = state.robots.filter(
    (r) => r.id !== sourceId && r.status !== "failed" && r.status !== "charging" && r.status !== "toCharge" && r.efficiency > 0 && r.battery > 45
  );
  return [...candidates].sort((a, b) => a.workload - b.workload || b.battery - a.battery || a.id - b.id)[0] || null;
}

function failRobot(state, robotId) {
  const robot = state.robots.find((r) => r.id === robotId);
  if (!robot || robot.status === "failed") return;

  const task = robot.currentTask;
  const pending = [...robot.pendingTasks];
  const tasks = [...(task ? [task] : []), ...pending];

  if (task?.teamSize === 2) {
    const teamIds = task.teamMembers || [robot.id];

    if (!task.completed) {
      state.taskQueue = [
        ...state.taskQueue,
        { ...task, assignedTo: null, teamMembers: [], teamAtStorage: [], teamAtInventory: [], teamWorkStarted: false, teamWorkRemaining: 0, workPositions: {} }
      ];
    }

    for (const id of teamIds) {
      const member = state.robots.find((r) => r.id === id);
      if (!member) continue;
      member.currentTask = null;
      member.pendingTasks = [];
      member.workload = 0;
      member.destination = null;
      member.path = [];
      member.tripPhase = null;
      member.teamRole = null;
      if (member.id !== robot.id && member.status !== "failed") {
        member.status = "idle";
      }
    }

    addLog(state, `R${robot.id} failed — cooperative task ${task.label} returned to queue`, "danger");
  } else if (tasks.length > 0) {
    const best = findLeastLoadedRobot(state, robot.id);

    if (best) {
      const totalWeight = tasks.reduce((sum, t) => sum + (t.weight || 0), 0);

      if (!best.currentTask && best.status === "idle") {
        const firstTask = tasks[0];
        best.currentTask = firstTask;
        best.pendingTasks = tasks.slice(1);
        best.destination = { ...INVENTORY_POS };
        best.path = bfsPath(best.pos, INVENTORY_POS) || [];
        best.status = "toInventory";
        best.tripPhase = "pickup";
      } else {
        best.pendingTasks = [...best.pendingTasks, ...tasks];
      }

      best.workload += totalWeight;
      state.stats.handovers += 1;
      addLog(state, `Failure handover: R${robot.id} → R${best.id} (${tasks.length} task${tasks.length > 1 ? "s" : ""})`, "danger");
    } else {
      state.taskQueue = [...state.taskQueue, ...tasks];
      addLog(state, `R${robot.id} failed — ${tasks.length} task(s) returned to queue`, "danger");
    }
  }

  robot.currentTask = null;
  robot.pendingTasks = [];
  robot.workload = 0;
  robot.destination = null;
  robot.path = [];
  robot.tripPhase = null;
  robot.teamRole = null;
  robot.timer = 0;
  robot.status = "failed";
  robot.stuckTicks = 0;

  addLog(state, `R${robot.id} OFFLINE — cell blocked until repair`, "danger");

  const blocked = new Set(
    state.robots.filter((r) => r.id !== robot.id).map((r) => keyOf(r.pos))
  );

  for (const r of state.robots) {
    if (r.id === robot.id || r.status === "failed" || !r.destination) continue;
    const alt = bfsPathAvoiding(r.pos, r.destination, new Set([...blocked, keyOf(robot.pos)]));
    if (alt) r.path = alt;
  }
}

function repairRobot(state, robotId) {
  const robot = state.robots.find((r) => r.id === robotId);
  if (!robot || robot.status !== "failed") return;

  robot.status = "idle";
  robot.battery = 100;
  robot.destination = null;
  robot.path = [];
  robot.timer = 0;
  robot.tripPhase = null;
  robot.stuckTicks = 0;
  robot.moveAccumulator = 0;

  addLog(state, `R${robot.id} repaired — rejoining fleet at ${robot.pos.x},${robot.pos.y}`, "success");
}

function simulationTick(prevState, bias, taskMode = "random") {
  const state = structuredClone(prevState);
  state.tick += 1;

  resolveMovement(state);
  processStateMachine(state);
  monitorBattery(state);

  if (taskMode === "random") {
    maybeSpawnTask(state, bias);
  }

  dispatchTasks(state);

  return state;
}

function createInitialState(seedTasks = false, robotCount = 5, efficiencies = []) {
  const count = Math.max(1, Math.min(10, robotCount));
  const robots = CHARGE_SLOTS.slice(0, count).map((slot, i) => ({
    id: i + 1,
    color: ROBOT_COLORS[i % ROBOT_COLORS.length],
    pos: { ...slot },
    path: [],
    destination: null,
    currentTask: null,
    pendingTasks: [],
    workload: 0,
    battery: 100,
    status: "idle",
    tripPhase: null,
    timer: 0,
    trail: [{ ...slot }],
    stuckTicks: 0,
    efficiency: Math.max(0, Math.min(100, efficiencies[i] ?? 100)),
    moveAccumulator: 0,
  }));

  const state = {
    tick: 0,
    robots,
    taskQueue: [],
    taskSeq: 0,
    logSeq: 0,
    stats: { completed: 0, handovers: 0, failures: 0, repairs: 0 },
    log: [{ id: 0, tick: 0, text: `Fleet initialized — ${count} robot${count === 1 ? "" : "s"} online at charging bay`, level: "success" }],
  };

  if (seedTasks) {
    for (let i = 0; i < 6; i++) {
      const loc = STORAGE[i % STORAGE.length];
      const weight = 2 + Math.floor(Math.random() * 8);
      const priority = i < 2 ? 3 : i < 4 ? 2 : 1;
      const task = makeTask(state, loc, weight, priority);
      state.taskQueue.push(task);
    }
    dispatchTasks(state);
  }

  return state;
}

/* ============================== UI HELPERS ============================== */
function batteryColor(pct) {
  if (pct >= 60) return "#1B9F6B";
  if (pct >= 30) return "#C2790C";
  return "#E0342A";
}

function statusLabel(robot) {
  if (robot.status === "atInventory") {
    return robot.tripPhase === "pickup" ? "Picking up" : "Dropping off";
  }
  return (
    {
      idle: "Idle",
      toStorage: "→ Storage",
      atStorage: "Collecting",
      toInventory: "→ Inventory",
      toCharge: "→ Charger",
      charging: "Charging",
    }[robot.status] || robot.status
  );
}

function statusColor(s) {
  return (
    {
      idle: "#7C8790",
      toStorage: "#4FD1E8",
      atStorage: "#F4C550",
      toInventory: "#B48CFF",
      atInventory: "#F4C550",
      toCharge: "#FF5C5C",
      charging: "#6FCF97",
    }[s] || "#7C8790"
  );
}

/* ============================== COMPONENT ============================== */
export default function WarehouseFleetSim() {
  const [state, setState] = useState(() => createInitialState(false));
  const [running, setRunning] = useState(false);
  const [fleetStatusOpen, setFleetStatusOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [bias, setBias] = useState("normal");
  const [taskMode, setTaskMode] = useState("injected");
  const [formOpen, setFormOpen] = useState(false);
  const [formLoc, setFormLoc] = useState("A1");
  const [formWeight, setFormWeight] = useState(5);
  const [formPriority, setFormPriority] = useState(2);
  const [formTeamSize, setFormTeamSize] = useState(1);
  const [selectedRobot, setSelectedRobot] = useState(null);
  const [activeNav, setActiveNav] = useState("fleet");
  const [settingsRobotCount, setSettingsRobotCount] = useState(5);
  const [settingsEfficiency, setSettingsEfficiency] = useState(() => Array(10).fill(100));

  // ---- Analytics history tracking ----
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory((prev) => {
      const avgBatt = Math.round(
        state.robots.reduce((s, r) => s + r.battery, 0) / state.robots.length
      );
      const point = {
        tick: state.tick,
        completed: state.stats.completed,
        handovers: state.stats.handovers,
        failures: state.stats.failures || 0,
        avgBattery: avgBatt,
        queueLength: state.taskQueue.length,
      };
      const next = [...prev, point];
      return next.length > 120 ? next.slice(next.length - 120) : next;
    });
  }, [state.tick]);

  useEffect(() => {
    if (!running) return;
    const ms = 900 / speed;
    const id = setInterval(() => {
      setState((prev) => simulationTick(prev, bias, taskMode));
    }, ms);
    return () => clearInterval(id);
  }, [running, speed, bias, taskMode]);

  const avgBattery = useMemo(
    () => Math.round(state.robots.reduce((s, r) => s + r.battery, 0) / state.robots.length),
    [state.robots]
  );

  function handleReset() {
    const efficiencies = state.robots.map((r) => r.efficiency ?? 100);

    const resetState = createInitialState(
      false,
      state.robots.length,
      efficiencies
    );

    resetState.robots = resetState.robots.map((r) => ({
      ...r,

      // Navigation reset
      path: [],
      destination: null,

      // Task reset
      currentTask: null,
      pendingTasks: [],
      workload: 0,

      // Robot state reset
      battery: 100,
      status: "idle",
      tripPhase: null,
      timer: 0,

      // Visual trail reset
      trail: [{ ...r.pos }],

      // Movement/gridlock reset
      stuckTicks: 0,
      moveAccumulator: 0,
    }));

    // Clear everything from the previous simulation
    resetState.taskQueue = [];
    resetState.tick = 0;
    resetState.taskSeq = 0;

    resetState.stats = {
      completed: 0,
      handovers: 0,
      failures: 0,
      repairs: 0,
    };

    resetState.log = [{
      id: 0,
      tick: 0,
      text: `Fleet reset — ${resetState.robots.length} robot${resetState.robots.length === 1 ? "" : "s"} returned to charging bay`,
      level: "success",
    }];

    setState(resetState);
    setRunning(false);
    setFormOpen(false);
    setSelectedRobot(null);
  }

  function openSettings() {
    setSettingsRobotCount(state.robots.length);
    setSettingsEfficiency(Array.from({ length: 10 }, (_, i) => state.robots[i]?.efficiency ?? 100));
    setActiveNav("settings");
  }

  function applyFleetSettings() {
    const count = Math.max(1, Math.min(10, settingsRobotCount));
    const efficiencies = settingsEfficiency.slice(0, count).map((v) => Math.max(0, Math.min(100, Number(v) || 0)));
    setState(createInitialState(false, count, efficiencies));
    setRunning(false);
    setFormOpen(false);
    setHistory([]);
  }

  function handleAddTask() {
    setState((prev) => {
      const s = structuredClone(prev);
      const loc = STORAGE.find((l) => l.id === formLoc);
      const task = makeTask(s, loc, formWeight, formPriority);
      task.teamSize = formTeamSize;
      s.taskQueue = [...s.taskQueue, task];
      addLog(
        s,
        `Operator queued ${task.label} @ ${loc.label} (w${formWeight}, ${PRIORITY_LABEL[formPriority]}, ${formTeamSize === 2 ? "2 robots" : "1 robot"})`,
        "info"
      );
      dispatchTasks(s);
      return s;
    });
    setFormOpen(false);
  }

  function handleFailRobot(robotId) {
    setState((prev) => {
      const s = structuredClone(prev);
      failRobot(s, robotId);
      s.stats.failures = (s.stats.failures || 0) + 1;
      return s;
    });
  }

  function handleRepairRobot(robotId) {
    setState((prev) => {
      const s = structuredClone(prev);
      repairRobot(s, robotId);
      s.stats.repairs = (s.stats.repairs || 0) + 1;
      return s;
    });
  }

  const targetedStorage = useMemo(() => {
    const set = new Set();
    state.robots.forEach((r) => {
      if (r.currentTask && (r.status === "toStorage" || r.status === "atStorage")) {
        set.add(r.currentTask.locLabel);
      }
    });
    return set;
  }, [state.robots]);

  const selected = selectedRobot ? state.robots.find((r) => r.id === selectedRobot) : null;

  const displayedTasks = useMemo(() => {
    const queued = state.taskQueue.map((t) => ({ ...t, assignedTo: null }));
    const activeMap = new Map();
    state.robots
      .filter((r) => r.currentTask)
      .forEach((r) => {
        const task = r.currentTask;
        if (!activeMap.has(task.id)) {
          activeMap.set(task.id, {
            ...task,
            assignedTo: task.assignedTo || r.id,
            active: true,
          });
        }
      });

    const active = [...activeMap.values()];
    const pending = state.robots.flatMap((r) =>
      r.pendingTasks.map((t) => ({ ...t, assignedTo: r.id, pending: true }))
    );

    return [...active, ...pending, ...queued]
      .sort((a, b) => b.priority - a.priority || b.weight - a.weight)
      .slice(0, 10);
  }, [state.taskQueue, state.robots]);

  const activeTaskCount =
    state.taskQueue.length +
    state.robots.reduce((sum, r) => sum + (r.currentTask ? 1 : 0) + r.pendingTasks.length, 0);

  const totalWorkload = state.robots.reduce((sum, r) => sum + r.workload, 0);

  const fleetEfficiency = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (state.robots.filter((r) => r.status !== "idle" && r.status !== "failed").length /
          Math.max(1, state.robots.filter((r) => r.status !== "failed").length)) * 100
      )
    )
  );

  const perRobotWorkload = useMemo(
    () => state.robots.map((r) => ({ name: `R${r.id}`, workload: r.workload, battery: r.battery })),
    [state.robots]
  );

  return (
    <div className="wf-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .wf-app {
          --bg: #F5F6F8;
          --bg-soft: #FFFFFF;
          --panel: #FFFFFF;
          --panel-2: #FAFBFC;
          --panel-3: #F1F3F6;
          --border: #E3E6EB;
          --border-bright: #C9CFD9;
          --text: #12141A;
          --muted: #6B7280;
          --blue: #3854E0;
          --cyan: #0EA5B7;
          --purple: #7C5CFC;
          --green: #12875A;
          --amber: #B7791F;
          --red: #D92D20;
          min-height: 100vh;
          background:
            radial-gradient(circle at 35% -15%, rgba(56,84,224,.06), transparent 40%),
            radial-gradient(circle at 90% 20%, rgba(124,92,252,.04), transparent 30%),
            var(--bg);
          color: var(--text);
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
          padding: 18px;
          box-sizing: border-box;
        }
        .wf-app * { box-sizing: border-box; }
        .wf-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .wf-shell { max-width: 1700px; margin: 0 auto; display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 14px; }
        .wf-nav { position: sticky; top: 18px; height: calc(100vh - 36px); min-height: 650px; background: linear-gradient(180deg, #ffffff, #fbfbfd); border: 1px solid var(--border); border-radius: 14px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; box-shadow: 0 1px 2px rgba(16,24,40,.04); }
        .wf-nav-item { width: 56px; min-height: 61px; border: 1px solid transparent; background: transparent; color: var(--muted); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; cursor: pointer; font-size: 9px; font-weight: 600; transition: .18s ease; }
        .wf-nav-item:hover { color: var(--text); background: rgba(16,24,40,.04); border-color: var(--border); }
        .wf-nav-item.active { color: var(--blue); background: rgba(56,84,224,.08); border-color: rgba(56,84,224,.22); box-shadow: inset 2px 0 0 var(--blue); }
        .wf-nav-spacer { flex: 1; }
        .wf-main { min-width: 0; }
        .wf-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; margin-bottom: 13px; }
        .wf-brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
        .wf-brand-icon { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; color: var(--blue); border: 1px solid rgba(56,84,224,.28); background: linear-gradient(145deg, rgba(56,84,224,.10), rgba(56,84,224,.02)); }
        .wf-title .eyebrow { display: block; color: var(--blue); font-size: 8px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; margin-bottom: 3px; }
        .wf-title h1 { margin: 0; font-size: clamp(21px, 2vw, 28px); line-height: 1.05; letter-spacing: -.01em; font-weight: 650; font-family: 'Space Grotesk', 'Inter', sans-serif; color: #17232b; }
        .wf-subtitle { margin: 5px 0 0; color: var(--muted); font-size: 10px; }
        .wf-header-right { display: grid; grid-template-columns: auto 58px; align-items: center; gap: 7px; flex-shrink: 0; }
        .wf-stats { display: grid; grid-template-columns: repeat(4, 68px); grid-template-rows: 50px; gap: 5px; flex-shrink: 0; }
        .wf-stat { width: 68px; height: 50px; min-width: 68px; padding: 5px 3px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; background: linear-gradient(145deg, #ffffff, #f7f8fa); position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(16,24,40,.03); }
        .wf-stat::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(56,84,224,.28), transparent); }
        .wf-stat .v { font-size: 13px; font-weight: 700; line-height: 1; }
        .wf-stat .l { margin-top: 4px; color: var(--muted); font-size: 5.5px; letter-spacing: .10em; text-transform: uppercase; white-space: nowrap; }
        .wf-live { width: 58px; min-width: 58px; height: 50px; border: 1px solid var(--border); border-radius: 10px; background: #F7FBF9; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 5px; color: var(--green); font-size: 8px; font-weight: 700; letter-spacing: .12em; }
        .wf-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 10px rgba(18,135,90,.45); }
        .wf-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 11px; background: rgba(255,255,255,.92); box-shadow: 0 1px 2px rgba(16,24,40,.03); flex-wrap: nowrap; }
        .wf-controls {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: nowrap;
          white-space: nowrap;
        }
        .wf-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--panel-3); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 11px; font-size: 11px; font-weight: 500; cursor: pointer; transition: .18s ease; font-family: inherit; }
        .wf-btn:hover { border-color: var(--border-bright); background: #EAEDF2; transform: translateY(-1px); }
        .wf-btn.primary { color: #fff; border-color: transparent; background: linear-gradient(180deg, #4361EE, #2C43C4); box-shadow: 0 1px 2px rgba(56,84,224,.35); }
        .wf-btn.active { color: var(--blue); border-color: rgba(56,84,224,.4); background: rgba(56,84,224,.08); }
        .wf-speedgroup { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--border); background: #F1F3F6; border-radius: 8px; }
        .wf-speedgroup button { background: transparent; border: 0; color: var(--muted); font-size: 10px; padding: 5px 9px; border-radius: 5px; cursor: pointer; font-family: inherit; font-weight: 500; }
        .wf-speedgroup button.active { color: #fff; background: var(--blue); font-weight: 700; }
        .wf-scenario-label { color: var(--muted); font-size: 8px; letter-spacing: .12em; text-transform: uppercase; margin-right: 2px; }
        .wf-task-mode-hint { margin: 7px 2px 10px; color: var(--muted); font-size: 8px; letter-spacing: .03em; opacity: .9; }
        .wf-workspace { display: grid; grid-template-columns: minmax(0, 2.25fr) minmax(300px, .65fr); gap: 12px; align-items: start; }
        .wf-left { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
        .wf-panel, .wf-map-panel { background: #FFFFFF; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04); }
        .wf-map-panel { padding: 10px; overflow: hidden; }
        .wf-map-header { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px 9px; }
        .wf-map-title { display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; }
        .wf-map-live { display: flex; align-items: center; gap: 6px; color: var(--green); font-size: 8px; letter-spacing: .1em; text-transform: uppercase; }
        .wf-map-frame { position: relative; border: 1px solid #12212B; border-radius: 8px; overflow: auto; background: #071016; min-height: 0; }
        .wf-map-frame svg { width: 100%; min-height: 0; height: auto; }
        .wf-map-frame svg { filter: drop-shadow(0 10px 25px rgba(0,0,0,.25)); }
        .wf-legend { display: flex; gap: 13px; flex-wrap: wrap; margin-top: 8px; padding: 0 3px; color: var(--muted); font-size: 8px; }
        .wf-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .wf-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
        .wf-analytics { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border); border-radius: 11px; overflow: hidden; background: var(--panel); }
        .wf-analytic { padding: 13px 16px; min-height: 78px; border-right: 1px solid var(--border); position: relative; }
        .wf-analytic:last-child { border-right: 0; }
        .wf-analytic-label { color: var(--muted); font-size: 8px; text-transform: uppercase; letter-spacing: .13em; }
        .wf-analytic-value { font-size: 25px; font-weight: 700; margin-top: 7px; font-family: 'Space Grotesk', 'Inter', sans-serif; }
        .wf-analytic-sub { color: var(--muted); font-size: 9px; margin-top: 2px; }
        .wf-side { min-width: 0; display: grid; grid-template-rows: auto auto auto; gap: 10px; }
        .wf-panel { padding: 8px; }
        .wf-panel h2 { margin: 0 0 6px; color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; }
        .wf-panel-link { color: var(--blue); font-size: 8px; letter-spacing: .04em; text-transform: none; }
        .wf-robot-list { display: grid; gap: 5px; }
        .wf-robot-card { border: 1px solid var(--border); border-left: 3px solid; border-radius: 9px; background: #FFFFFF; padding: 6px 7px; cursor: pointer; transition: .18s ease; }
        .wf-robot-card:hover, .wf-robot-card.selected { background: #F5F7FA; border-color: var(--border-bright); box-shadow: inset 0 0 0 1px rgba(56,84,224,.08); }
        .wf-robot-card.selected { outline: 1px solid rgba(56,84,224,.35); }
        .wf-robot-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 7px; }
        .wf-robot-id-wrap { display: flex; align-items: center; gap: 7px; }
        .wf-robot-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
        .wf-robot-id { font-size: 11px; font-weight: 750; }
        .wf-robot-status { padding: 4px 7px; border-radius: 7px; background: rgba(16,24,40,.05); font-size: 8px; white-space: nowrap; }
        .wf-bar-row { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 8px; margin-top: 4px; }
        .wf-bar-label { width: 34px; }
        .wf-bar-value { width: 34px; text-align: right; }
        .wf-bar-track { flex: 1; height: 5px; background: #EEF0F3; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
        .wf-bar-fill { height: 100%; border-radius: 5px; transition: width .3s ease; }
        .wf-robot-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 8px; margin-top: 7px; }
        .wf-task-list { display: grid; gap: 5px; max-height: 245px; overflow: auto; }
        .wf-task-chip { display: grid; grid-template-columns: 38px 1fr auto; align-items: center; gap: 8px; padding: 7px 8px; background: #FAFBFC; border: 1px solid var(--border); border-radius: 7px; font-size: 9px; }
        .wf-task-id { color: var(--text); font-weight: 750; }
        .wf-task-route { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wf-task-route b { color: var(--text); }
        .wf-pri { font-size: 7px; padding: 3px 6px; border-radius: 8px; font-weight: 750; text-transform: uppercase; }
        .wf-log { max-height: 245px; overflow-y: auto; display: grid; gap: 5px; }
        .wf-log-item { display: grid; grid-template-columns: 38px 1fr; gap: 7px; padding: 7px 8px; background: #FAFBFC; border: 1px solid var(--border); border-left: 2px solid; border-radius: 7px; color: var(--muted); font-size: 8.5px; line-height: 1.35; }
        .wf-log-item b { color: var(--text); font-weight: 500; }
        .wf-empty { color: var(--muted); font-size: 10px; padding: 12px 2px; text-align: center; }
        .wf-selected-panel { background: #FFFFFF; }
        .wf-selected-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
        .wf-detail { padding: 8px; border: 1px solid var(--border); border-radius: 7px; background: rgba(16,24,40,.02); }
        .wf-detail-label { color: var(--muted); font-size: 7px; text-transform: uppercase; letter-spacing: .1em; }
        .wf-detail-value { margin-top: 4px; font-size: 10px; font-weight: 650; }
        .wf-form { display: grid; grid-template-columns: 1fr 1fr 1fr auto; align-items: end; gap: 9px; padding-top: 11px; margin-top: 10px; border-top: 1px dashed var(--border); }
        .wf-form label { color: var(--muted); font-size: 8px; display: flex; flex-direction: column; gap: 5px; }
        .wf-form select { width: 100%; background: var(--panel-3); color: var(--text); border: 1px solid var(--border); border-radius: 7px; padding: 7px; font-family: inherit; font-size: 10px; }
        .wf-form input[type=range] { width: 100%; accent-color: var(--blue); }
        .wf-settings-grid { display: grid; grid-template-columns: minmax(280px, .75fr) minmax(420px, 1.25fr); gap: 12px; }
        .wf-settings-card { border: 1px solid var(--border); border-radius: 11px; padding: 16px; background: #FFFFFF; }
        .wf-settings-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .wf-settings-card h3 { margin: 3px 0 0; font-size: 15px; font-family: 'Space Grotesk', 'Inter', sans-serif; }
        .wf-panel-kicker { color: var(--blue); font-size: 8px; font-weight: 750; letter-spacing: .13em; }
        .wf-settings-number { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 9px; border: 1px solid rgba(56,84,224,.28); background: rgba(56,84,224,.08); color: var(--blue); font-size: 16px; font-weight: 800; font-family: 'Space Grotesk', 'Inter', sans-serif; }
        .wf-settings-help { color: var(--muted); font-size: 9px; line-height: 1.5; margin: 10px 0 15px; }
        .wf-range { width: 100%; accent-color: var(--blue); cursor: pointer; }
        .wf-range-labels { display: flex; justify-content: space-between; color: var(--muted); font-size: 8px; margin-top: 4px; }
        .wf-efficiency-list { display: grid; gap: 8px; margin-top: 13px; }
        .wf-efficiency-row { display: grid; grid-template-columns: 42px 1fr 48px; align-items: center; gap: 10px; }
        .wf-efficiency-name { display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 700; }
        .wf-efficiency-name .wf-robot-dot { width: 7px; height: 7px; }
        .wf-efficiency-value { text-align: right; color: var(--text); font-size: 9px; font-weight: 700; }
        .wf-settings-actions { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .wf-settings-note { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 8px; }
        .wf-page-view { min-height: calc(100vh - 170px); display: flex; flex-direction: column; gap: 14px; }
        .wf-page-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 8px 4px; }
        .wf-page-eyebrow { color: var(--blue); font-size: 9px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 5px; }
        .wf-page-header h2 { margin: 0; font-size: 24px; letter-spacing: -.01em; font-weight: 650; font-family: 'Space Grotesk', 'Inter', sans-serif; }
        .wf-page-header p { margin: 5px 0 0; color: var(--muted); font-size: 10px; }
        .wf-page-count { color: var(--blue); border: 1px solid rgba(56,84,224,.24); background: rgba(56,84,224,.06); border-radius: 8px; padding: 8px 11px; font-size: 9px; }
        .wf-page-panel { flex: 1; min-height: 500px; padding: 16px; background: #FFFFFF; border: 1px solid var(--border); border-radius: 12px; }
        .wf-full-task-list { display: grid; gap: 8px; }
        .wf-full-task { display: grid; grid-template-columns: 80px 1fr 260px; align-items: center; gap: 20px; padding: 15px; background: #FAFBFC; border: 1px solid var(--border); border-radius: 9px; transition: .18s ease; }
        .wf-full-task:hover { border-color: var(--border-bright); background: #F5F7FA; }
        .wf-full-task-id { color: var(--blue); font-size: 13px; font-weight: 750; }
        .wf-full-task-location { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
        .wf-full-task-location span { color: var(--muted); font-size: 9px; }
        .wf-full-task-meta { display: flex; justify-content: flex-end; gap: 16px; color: var(--muted); font-size: 9px; flex-wrap: wrap; }
        .wf-full-task-meta b { color: var(--text); }
        .wf-full-log { display: grid; gap: 6px; }
        .wf-full-log-item { display: grid; grid-template-columns: 65px 1fr; gap: 15px; padding: 12px 14px; background: #FAFBFC; border: 1px solid var(--border); border-left: 3px solid; border-radius: 7px; }
        .wf-event-tick { color: var(--muted); font-size: 9px; }
        .wf-event-message { color: var(--text); font-size: 10px; }
        .wf-analytics-page { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-content: start; }
        .wf-analytics-page .wf-analytic { min-height: 140px; border: 1px solid var(--border); border-radius: 11px; background: #FFFFFF; }
        .wf-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
        .wf-chart-panel { min-height: 260px; }
        .wf-chart-title { margin: 0 0 10px; font-size: 12px; color: var(--muted); letter-spacing: .08em; text-transform: uppercase; }
        @keyframes wf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
        .wf-pulse { animation: wf-pulse 1.1s ease-in-out infinite; }
        @media (max-width: 1250px) {
          .wf-workspace { grid-template-columns: minmax(0, 1fr) 270px; }
          .wf-map-frame, .wf-map-frame svg { min-height: 580px; }
          .wf-stat { width: 64px; min-width: 64px; height: 48px; }
          .wf-stats { grid-template-columns: repeat(4, 64px); grid-template-rows: 48px; }
          .wf-stat .v { font-size: 12px; }
          .wf-stat .l { font-size: 5px; }
        }
        @media (max-width: 1050px) {
          .wf-shell { grid-template-columns: 1fr; }
          .wf-nav { position: static; height: auto; min-height: 0; flex-direction: row; justify-content: flex-start; overflow-x: auto; }
          .wf-nav-spacer { display: none; }
          .wf-workspace { grid-template-columns: 1fr; }
          .wf-map-frame, .wf-map-frame svg { min-height: 500px; }
          .wf-side { grid-template-columns: 1fr 1fr; }
          .wf-side > :last-child { grid-column: 1 / -1; }
          .wf-charts-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .wf-app { padding: 9px; }
          .wf-header { display: flex; align-items: flex-start; flex-direction: column; }
          .wf-header-right { width: 100%; display: grid; grid-template-columns: 1fr; }
          .wf-stats { width: 100%; grid-template-columns: repeat(4, minmax(58px, 1fr)); grid-template-rows: 48px; }
          .wf-stat { width: auto; min-width: 0; }
          .wf-live { display: none; }
          .wf-toolbar { align-items: flex-start; flex-direction: column; }
          .wf-side { grid-template-columns: 1fr; }
          .wf-side > :last-child { grid-column: auto; }
          .wf-analytics { grid-template-columns: 1fr; }
          .wf-analytic { border-right: 0; border-bottom: 1px solid var(--border); }
          .wf-analytic:last-child { border-bottom: 0; }
          .wf-form { grid-template-columns: 1fr; }
          .wf-page-header { align-items: flex-start; gap: 10px; flex-direction: column; }
          .wf-full-task { grid-template-columns: 1fr; gap: 8px; }
          .wf-full-task-meta { justify-content: flex-start; }
          .wf-analytics-page { grid-template-columns: 1fr; }
          .wf-settings-grid { grid-template-columns: 1fr; }
          .wf-settings-actions { align-items: flex-start; flex-direction: column; }
        }
        .wf-fleet-compact { margin-bottom: 12px; }
        .wf-fleet-compact-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
        .wf-compact-robot { min-width: 0; padding: 7px 8px; border: 1px solid var(--border); border-top: 2px solid; border-radius: 5px; background: #FAFBFC; cursor: pointer; }
        .wf-compact-robot.selected { box-shadow: inset 0 0 0 1px var(--blue); }
        .wf-compact-top { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
        .wf-compact-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; margin-top: 6px; font: 8px/1.2 'JetBrains Mono', monospace; color: var(--muted); }
        .wf-compact-metrics b { font-size: 7px; color: var(--muted); margin-right: 3px; }
        .wf-compact-metrics em { color: var(--text); font-style: normal; }
        .wf-compact-task { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-top: 6px; font: 8px 'JetBrains Mono', monospace; color: var(--muted); }
        .wf-compact-actions { display: flex; gap: 4px; margin-top: 6px; }
        .wf-compact-actions .wf-btn { flex: 1; padding: 3px 5px; font-size: 7px; }
        .wf-compact-selected { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 8px; margin-top: 8px; border-top: 1px solid var(--border); color: var(--muted); font-size: 8px; }
        .wf-compact-selected span:first-child { color: var(--text); font-weight: 800; }
        .wf-main-grid { grid-template-columns: minmax(0, 1fr); }
        .wf-main-grid > * { min-width: 0; }
        .wf-main-grid svg { width: 100% !important; max-width: none !important; }
        .wf-map-frame svg { min-width: 0 !important; min-height: 0 !important; }
        .wf-map-frame { width: 100%; overflow: hidden; }
        .wf-map-panel { width: 100%; max-width: none; }
        .wf-map-panel > div { max-width: none; }
        .wf-fleet-toggle-row { margin: 0 0 0 8px; display: inline-flex; }
        .wf-fleet-toggle { white-space: nowrap; }
      `}</style>

      <div className="wf-shell">
        <aside className="wf-nav">
          <button className={"wf-nav-item" + (activeNav === "fleet" ? " active" : "")} onClick={() => setActiveNav("fleet")}>
            <Bot size={18} />
            <span>Fleet</span>
          </button>
          <button className={"wf-nav-item" + (activeNav === "settings" ? " active" : "")} onClick={openSettings}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button className={"wf-nav-item" + (activeNav === "tasks" ? " active" : "")} onClick={() => setActiveNav("tasks")}>
            <ClipboardList size={18} />
            <span>Tasks</span>
          </button>
          <button className={"wf-nav-item" + (activeNav === "events" ? " active" : "")} onClick={() => setActiveNav("events")}>
            <Bell size={18} />
            <span>Events</span>
          </button>
          <button className={"wf-nav-item" + (activeNav === "analytics" ? " active" : "")} onClick={() => setActiveNav("analytics")}>
            <BarChart3 size={18} />
            <span>Analytics</span>
          </button>
          <div className="wf-nav-spacer" />
        </aside>

        <main className="wf-main">
          <header className="wf-header">
            <div className="wf-brand">
              <div className="wf-brand-icon">
                <Bot size={29} />
              </div>
              <div className="wf-title">
                <span className="eyebrow">Autonomous Mobile Robot Fleet</span>
                <h1>Warehouse Fleet Coordination</h1>
                <p className="wf-subtitle">Real-time multi-robot coordination & resource optimization</p>
              </div>
            </div>
            <div className="wf-header-right">
              <div className="wf-stats wf-mono">
                <div className="wf-stat">
                  <div className="v">{state.tick}</div>
                  <div className="l">Ticks</div>
                </div>
                <div className="wf-stat">
                  <div className="v">{state.stats.completed}</div>
                  <div className="l">Completed</div>
                </div>
                <div className="wf-stat">
                  <div className="v">{state.stats.handovers}</div>
                  <div className="l">Handovers</div>
                </div>
                <div className="wf-stat">
                  <div className="v" style={{ color: batteryColor(avgBattery) }}>{avgBattery}%</div>
                  <div className="l">Avg Battery</div>
                </div>
              </div>
              <div className="wf-live">
                <span className="wf-live-dot" />
                <span>{running ? "LIVE" : "PAUSED"}</span>
              </div>
            </div>
          </header>

          <div className="wf-toolbar">
            <div className="wf-controls">
              <button className={"wf-btn" + (running ? " active" : "")} onClick={() => setRunning((r) => !r)}>
                {running ? <Pause size={14} /> : <Play size={14} />}
                {running ? "Pause" : "Run"}
              </button>
              <div className="wf-speedgroup">
                {[1, 2, 4].map((s) => (
                  <button key={s} className={speed === s ? "active" : ""} onClick={() => setSpeed(s)}>
                    {s}x
                  </button>
                ))}
              </div>
              <button className="wf-btn" onClick={handleReset}>
                <RotateCcw size={14} /> Reset
              </button>
              <button className={"wf-btn primary" + (formOpen ? " active" : "")} onClick={() => setFormOpen((f) => !f)}>
                <PackagePlus size={14} /> {taskMode === "injected" ? "Inject Task" : "Queue Task"}
              </button>
              <div className="wf-fleet-toggle-row">
                <button className="wf-btn wf-fleet-toggle" onClick={() => setFleetStatusOpen((v) => !v)} aria-expanded={fleetStatusOpen}>
                  {fleetStatusOpen ? "HIDE FLEET STATUS" : "SHOW FLEET STATUS"}
                  <span className="wf-panel-link">
                    {state.robots.filter((r) => r.status !== "failed").length}/{state.robots.length} online
                  </span>
                </button>
              </div>
            </div>

            <div className="wf-controls">
              <span className="wf-scenario-label">Tasks</span>
              <div className="wf-speedgroup">
                <button className={taskMode === "random" ? "active" : ""} onClick={() => setTaskMode("random")} title="Automatically generate random tasks">
                  Random
                </button>
                <button
                  className={taskMode === "injected" ? "active" : ""}
                  onClick={() => {
                    setTaskMode("injected");
                    setState((prev) => {
                      const s = structuredClone(prev);
                      s.taskQueue = [];
                      s.robots.forEach((r) => {
                        if (r.status === "idle") {
                          r.currentTask = null;
                          r.pendingTasks = [];
                          r.destination = null;
                          r.path = [];
                          r.workload = 0;
                        }
                      });
                      addLog(s, "Injected mode enabled — automatic workload disabled", "info");
                      return s;
                    });
                  }}
                  title="Only create tasks through Inject Task"
                >
                  Injected
                </button>
              </div>
              <span className="wf-scenario-label" style={{ marginLeft: 4 }}>Scenario</span>
              <div className="wf-speedgroup">
                {[
                  { k: "normal", l: "Balanced" },
                  { k: "heavy", l: "Heavy" },
                  { k: "urgent", l: "Urgent" },
                ].map((o) => (
                  <button key={o.k} className={bias === o.k ? "active" : ""} onClick={() => setBias(o.k)}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="wf-task-mode-hint">
            {taskMode === "random"
              ? "Random task generation is enabled. New tasks will be generated while the simulation runs."
              : "Injected mode: use “Inject Task” to add test workloads manually."}
          </div>

          {formOpen && (
            <div className="wf-panel" style={{ marginBottom: 12 }}>
              <h2>
                New Task
                <X size={14} style={{ cursor: "pointer" }} onClick={() => setFormOpen(false)} />
              </h2>
              <div className="wf-form">
                <label>
                  Storage location
                  <select value={formLoc} onChange={(e) => setFormLoc(e.target.value)}>
                    {STORAGE.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Weight: {formWeight}
                  <input type="range" min={1} max={10} value={formWeight} onChange={(e) => setFormWeight(+e.target.value)} />
                </label>
                <label>
                  Priority
                  <select value={formPriority} onChange={(e) => setFormPriority(+e.target.value)}>
                    <option value={1}>Low</option>
                    <option value={2}>Medium</option>
                    <option value={3}>High</option>
                  </select>
                </label>
                <label>
                  Robots for task
                  <select value={formTeamSize} onChange={(e) => setFormTeamSize(Number(e.target.value))}>
                    <option value={1}>1 Robot</option>
                    <option value={2}>2 Robots — faster</option>
                  </select>
                </label>
                <button className="wf-btn primary" onClick={handleAddTask}>
                  <Plus size={14} /> Add to queue
                </button>
              </div>
            </div>
          )}

          {activeNav === "fleet" && (
            <div className="wf-workspace">
              <div className="wf-left">
                {fleetStatusOpen && (
                  <div className="wf-fleet-collapsible">
                    <section className="wf-panel wf-fleet-compact">
                      <h2>
                        <span>Fleet Status</span>
                        <span className="wf-panel-link">
                          {state.robots.filter((r) => r.status !== "failed").length} online ·{" "}
                          {state.robots.filter((r) => r.status !== "idle" && r.status !== "charging" && r.status !== "failed").length} active ·{" "}
                          {state.robots.filter((r) => r.status === "charging").length} charging ·{" "}
                          {state.robots.filter((r) => r.status === "failed").length} failed
                        </span>
                      </h2>
                      <div className="wf-fleet-compact-grid">
                        {state.robots.map((r) => (
                          <div
                            key={r.id}
                            className={"wf-compact-robot" + (selectedRobot === r.id ? " selected" : "")}
                            style={{ borderTopColor: r.color }}
                            onClick={() => setSelectedRobot(r.id)}
                          >
                            <div className="wf-compact-top">
                              <span className="wf-robot-id-wrap">
                                <span className="wf-robot-dot" style={{ background: r.color }} />
                                <span className="wf-robot-id wf-mono">R{r.id}</span>
                              </span>
                              <span className="wf-robot-status wf-mono" style={{ color: statusColor(r.status) }}>
                                {statusLabel(r)}
                              </span>
                            </div>
                            <div className="wf-compact-metrics">
                              <span><b>BATT</b> <em style={{ color: batteryColor(r.battery) }}>{Math.round(r.battery)}%</em></span>
                              <span><b>LOAD</b> <em>{r.workload}</em></span>
                              <span><b>EFF</b> <em>{r.efficiency ?? 100}%</em></span>
                              <span><b>PEND</b> <em>{r.pendingTasks.length}</em></span>
                            </div>
                            <div className="wf-compact-task">
                              {r.currentTask ? `${r.currentTask.label} · w${r.currentTask.weight}` : "No active task"}
                            </div>
                            <div className="wf-compact-actions">
                              <button className="wf-btn" onClick={(e) => { e.stopPropagation(); handleFailRobot(r.id); }} disabled={r.status === "failed"}>FAIL</button>
                              <button className="wf-btn" onClick={(e) => { e.stopPropagation(); handleRepairRobot(r.id); }} disabled={r.status !== "failed"}>REPAIR</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {selected && (
                        <div className="wf-compact-selected wf-mono">
                          <span>R{selected.id}</span>
                          <span>POS {selected.pos.x},{selected.pos.y}</span>
                          <span>TASK {selected.currentTask?.label || "—"}</span>
                          <span>LOAD {selected.workload}</span>
                          <span>PENDING {selected.pendingTasks.length}</span>
                          <span>EFF {selected.efficiency ?? 100}%</span>
                          <span style={{ color: batteryColor(selected.battery) }}>BATTERY {Math.round(selected.battery)}%</span>
                        </div>
                      )}
                    </section>
                  </div>
                )}

                <section className="wf-map-panel">
                  <div className="wf-map-header">
                    <div className="wf-map-title">
                      <Activity size={13} color="var(--blue)" />
                      Live Warehouse Map
                    </div>
                    <div className="wf-map-live">
                      <span className="wf-live-dot" />
                      Simulation {running ? "running" : "paused"}
                    </div>
                  </div>
                  <div className="wf-map-frame">
                    <svg viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`} style={{ width: "100%", height: "auto", display: "block" }}>
                      <defs>
                        <pattern id="wf-hazard" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                          <rect width="10" height="10" fill="#F4B23F" opacity="0.10" />
                          <rect width="5" height="10" fill="#F4B23F" opacity="0.27" />
                        </pattern>
                        <linearGradient id="wf-floor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0a131a" />
                          <stop offset="100%" stopColor="#071016" />
                        </linearGradient>
                        <filter id="wf-glow">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <rect x="0" y="0" width={COLS * CELL} height={ROWS * CELL} fill="url(#wf-floor)" />
                      {Array.from({ length: COLS + 1 }).map((_, i) => (
                        <line key={"vl" + i} x1={i * CELL} y1={0} x2={i * CELL} y2={ROWS * CELL} stroke="#13202a" strokeWidth="1" />
                      ))}
                      {Array.from({ length: ROWS + 1 }).map((_, i) => (
                        <line key={"hl" + i} x1={0} y1={i * CELL} x2={COLS * CELL} y2={i * CELL} stroke="#13202a" strokeWidth="1" />
                      ))}
                      <rect x="1" y="1" width={COLS * CELL - 2} height={ROWS * CELL - 2} fill="none" stroke="#263845" strokeWidth="2" rx="5" />
                      {RECTS.map((r) => {
                        const active = targetedStorage.has(r.label);
                        const x = r.x0 * CELL + 2;
                        const y = r.y0 * CELL + 2;
                        const w = (r.x1 - r.x0 + 1) * CELL - 4;
                        const h = (r.y1 - r.y0 + 1) * CELL - 4;
                        const cx = x + w / 2;
                        const cy = y + h / 2;
                        return (
                          <g key={"taskbay-" + r.id}>
                            <rect x={x} y={y} width={w} height={h} rx="6" fill={active ? "#18232c" : "#111b23"} stroke={active ? "#F4B23F" : "#31424e"} strokeWidth={active ? "2.2" : "1.4"} className={active ? "wf-pulse" : ""} />
                            <rect x={x + 1} y={y + 1} width={w - 2} height="5" rx="3" fill={active ? "#F4B23F" : "#46535b"} opacity={active ? ".85" : ".65"} />
                            <text x={cx} y={y - 7} textAnchor="middle" fontSize="9" fill={active ? "#F4B23F" : "#91a2ad"} className="wf-mono" fontWeight="800">{r.label}</text>
                            <text x={cx} y={cy + 3} textAnchor="middle" fontSize="7" fill={active ? "#F4B23F" : "#61727d"} className="wf-mono" fontWeight="700">TASK BAY</text>
                            {active && (<circle cx={cx} cy={cy - 10} r="3" fill="#F4B23F" className="wf-pulse" />)}
                          </g>
                        );
                      })}
                      {OBSTACLES.map((o) => {
                        const x = o.x * CELL;
                        const y = o.y * CELL;
                        const w = o.w * CELL;
                        const h = o.h * CELL;
                        if (o.type === "drum") {
                          const cx = x + w / 2;
                          const cy = y + h / 2;
                          const rx = CELL * 0.30;
                          const ry = CELL * 0.10;
                          const bodyTop = cy - CELL * 0.25;
                          const bodyBottom = cy + CELL * 0.25;
                          return (
                            <g key={o.id}>
                              <ellipse cx={cx} cy={cy + CELL * 0.32} rx={CELL * 0.32} ry={CELL * 0.10} fill="#000" opacity=".35" />
                              <rect x={cx - rx} y={bodyTop} width={rx * 2} height={bodyBottom - bodyTop} rx={CELL * 0.08} fill="#53616a" stroke="#aebbc1" strokeWidth="1.4" />
                              <ellipse cx={cx} cy={bodyTop} rx={rx} ry={ry} fill="#718089" stroke="#c2cdd1" strokeWidth="1.2" />
                              <ellipse cx={cx} cy={bodyBottom} rx={rx} ry={ry} fill="#3c484f" stroke="#87969e" strokeWidth="1" />
                              <path d={`M ${cx - rx} ${cy - CELL * 0.08} Q ${cx} ${cy - CELL * 0.14} ${cx + rx} ${cy - CELL * 0.08}`} fill="none" stroke="#c2cdd1" strokeWidth="1" opacity=".7" />
                              <path d={`M ${cx - rx} ${cy + CELL * 0.08} Q ${cx} ${cy + CELL * 0.14} ${cx + rx} ${cy + CELL * 0.08}`} fill="none" stroke="#26343b" strokeWidth="1" opacity=".8" />
                              <ellipse cx={cx} cy={bodyTop} rx={CELL * 0.12} ry={CELL * 0.035} fill="#26343b" />
                              <text x={cx} y={cy + 2} textAnchor="middle" fontSize="5" fill="#e4ecef" fontWeight="900" className="wf-mono">DRUM</text>
                            </g>
                          );
                        }
                        return (
                          <g key={o.id}>
                            <rect x={x + 3} y={y + 5} width={w - 1} height={h - 1} rx="2" fill="#000" opacity=".30" />
                            <rect x={x + 2} y={y + 3} width={w - 4} height={h - 5} rx="2" fill="#80633f" stroke="#c4a06b" strokeWidth="1.4" />
                            <path d={`M ${x + 2} ${y + 3} L ${x + 7} ${y - 2} L ${x + w - 1} ${y - 2} L ${x + w - 4} ${y + 3} Z`} fill="#a88452" stroke="#d5b47c" strokeWidth="1" />
                            <line x1={x + 2} y1={y + 3} x2={x + 2} y2={y + h - 2} stroke="#59442c" strokeWidth="1" />
                            <line x1={x + w - 4} y1={y + 3} x2={x + w - 4} y2={y + h - 2} stroke="#59442c" strokeWidth="1" />
                            <rect x={x + w / 2 - 2.5} y={y + 3} width="5" height={Math.max(2, h - 7)} fill="#c6a96d" opacity=".6" />
                            <line x1={x + 4} y1={y + h * 0.55} x2={x + w - 6} y2={y + h * 0.55} stroke="#5b452d" strokeWidth="1" opacity=".7" />
                            <rect x={x + w / 2 - (o.w > 1 ? 12 : 8)} y={y + h / 2 - 4} width={o.w > 1 ? 24 : 16} height="8" rx="1.5" fill="#d8bd88" opacity=".9" />
                            <text x={x + w / 2} y={y + h / 2 + 2} textAnchor="middle" fontSize={o.w > 1 ? "5" : "4"} fill="#463521" fontWeight="900" className="wf-mono">BOX</text>
                          </g>
                        );
                      })}
                      <g filter="url(#wf-glow)">
                        <circle cx={INVENTORY_POS.x * CELL + CELL / 2} cy={INVENTORY_POS.y * CELL + CELL / 2} r="30" fill="rgba(244,178,63,.05)" stroke="#F4B23F" strokeWidth="1" strokeDasharray="4 4" />
                        <circle cx={INVENTORY_POS.x * CELL + CELL / 2} cy={INVENTORY_POS.y * CELL + CELL / 2} r="20" fill="#111b23" stroke="#F4B23F" strokeWidth="2" />
                      </g>
                      <text x={INVENTORY_POS.x * CELL + CELL / 2} y={INVENTORY_POS.y * CELL + CELL / 2 + 3} textAnchor="middle" fontSize="8" fill="#F4B23F" className="wf-mono" fontWeight="800">INV</text>
                      {CHARGE_SLOTS.map((s, i) => {
                        const occupied = state.robots.some(
                          (r) => (r.pos.x === s.x && r.pos.y === s.y) ||
                            ((r.status === "charging" || r.status === "toCharge") && r.destination && r.destination.x === s.x && r.destination.y === s.y)
                        );
                        return (
                          <g key={"slot" + i}>
                            <rect x={s.x * CELL + 3} y={s.y * CELL + 3} width={CELL - 6} height={CELL - 6} rx="4" fill={occupied ? "rgba(88,217,139,.12)" : "url(#wf-hazard)"} stroke={occupied ? "#58D98B" : "#31414c"} strokeWidth="1" />
                            <text x={s.x * CELL + CELL / 2} y={s.y * CELL + CELL / 2 + 3} textAnchor="middle" fontSize="8" fill={occupied ? "#58D98B" : "#657581"} className="wf-mono" fontWeight="700">⚡</text>
                          </g>
                        );
                      })}
                      <text x={CHARGE_SLOTS[0].x * CELL + CELL / 2} y={CHARGE_SLOTS[0].y * CELL - 8} textAnchor="middle" fontSize="8" fill="#58D98B" className="wf-mono" fontWeight="800">CHARGE BAY</text>
                      {state.robots.map((r) => {
                        if (!r.path || r.path.length === 0) return null;
                        const pts = [r.pos, ...r.path].map((p) => `${p.x * CELL + CELL / 2},${p.y * CELL + CELL / 2}`).join(" ");
                        return (
                          <polyline
                            key={"path" + r.id}
                            points={pts}
                            fill="none"
                            stroke={r.color}
                            strokeWidth={selectedRobot === r.id ? "2.3" : "1.4"}
                            strokeDasharray="4,5"
                            opacity={selectedRobot === r.id ? ".8" : ".36"}
                          />
                        );
                      })}
                      {state.robots.map((r) => {
                        const cx = r.pos.x * CELL + CELL / 2;
                        const cy = r.pos.y * CELL + CELL / 2;
                        const pct = Math.max(0, Math.min(100, r.battery));
                        const bColor = batteryColor(pct);
                        const warn = r.status === "toCharge" || pct < 30;
                        const isSelected = selectedRobot === r.id;
                        return (
                          <g key={r.id} transform={`translate(${cx},${cy})`} className={warn ? "wf-pulse" : ""} onClick={() => setSelectedRobot(r.id)} style={{ cursor: "pointer" }}>
                            {isSelected && (
                              <rect x="-24" y="-24" width="48" height="48" rx="10" fill="none" stroke={r.color} strokeWidth="1.5" strokeDasharray="3 3" opacity=".9" />
                            )}
                            <ellipse cx="0" cy="15" rx="18" ry="5" fill="#000" opacity=".42" />
                            <rect x="-21" y="-8" width="6" height="19" rx="3" fill="#202b32" stroke={r.color} strokeWidth="1.2" />
                            <rect x="15" y="-8" width="6" height="19" rx="3" fill="#202b32" stroke={r.color} strokeWidth="1.2" />
                            <rect x="-16" y="-9" width="32" height="25" rx="7" fill="#111d25" stroke={r.color} strokeWidth="2.4" />
                            <rect x="-11" y="-18" width="22" height="14" rx="5" fill="#172731" stroke={r.color} strokeWidth="1.8" />
                            <rect x="-2" y="-23" width="4" height="5" rx="1.5" fill={r.color} />
                            <circle cx="0" cy="-24" r="2" fill={r.color} />
                            <rect x="-7" y="-15" width="14" height="7" rx="2.5" fill="#071016" stroke="#526772" strokeWidth=".8" />
                            <circle cx="-3.5" cy="-11.5" r="1.5" fill={r.color} />
                            <circle cx="3.5" cy="-11.5" r="1.5" fill={r.color} />
                            <circle cx="0" cy="0" r="6" fill="#071016" stroke="#a9c1ca" strokeWidth="1.2" />
                            <circle cx="0" cy="0" r="2.5" fill={bColor} />
                            <rect x="-11" y="9" width="22" height="4" rx="2" fill="#071016" stroke={r.color} strokeWidth=".9" />
                            <path d="M 0 14 L 0 20 M 0 20 L -3 17 M 0 20 L 3 17" fill="none" stroke={r.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            <rect x="-12" y="-28" width="24" height="3.5" rx="1.7" fill="#17232b" stroke="#33454f" strokeWidth=".6" />
                            <rect x="-11.5" y="-27.5" width={23 * (pct / 100)} height="2.5" rx="1.2" fill={bColor} />
                            <rect x="-11" y="18" width="22" height="8" rx="2.5" fill="#071016" stroke={r.color} strokeWidth=".9" />
                            <text textAnchor="middle" y="24" fontSize="7" fill="#e7f1f5" fontWeight="900" className="wf-mono">R{r.id}</text>
                            {r.status === "failed" && (
                              <text textAnchor="middle" y="-33" fontSize="6.5" fill="#FF4D5A" fontWeight="900" className="wf-mono">OFFLINE</text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div className="wf-legend wf-mono">
                    <span><span className="wf-dot" style={{ background: "#58D98B" }} /> Battery ≥60%</span>
                    <span><span className="wf-dot" style={{ background: "#F4B23F" }} /> Battery 30–60%</span>
                    <span><span className="wf-dot" style={{ background: "#FF6470" }} /> Battery &lt;30%</span>
                    <span>┄┄ planned route</span>
                    <span>▨ shared bottleneck</span>
                    <span>● click robot for details</span>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeNav === "tasks" && (
            <section className="wf-page-view">
              <div className="wf-page-header">
                <div>
                  <div className="wf-page-eyebrow">OPERATIONS</div>
                  <h2>Task Queue</h2>
                  <p>Active, pending and queued warehouse tasks</p>
                </div>
                <div className="wf-page-count wf-mono">{displayedTasks.length} TASKS</div>
              </div>
              <div className="wf-page-panel">
                <div className="wf-full-task-list">
                  {displayedTasks.length === 0 ? (
                    <div className="wf-empty">No active tasks.</div>
                  ) : displayedTasks.map((t) => (
                    <div key={`${t.id}-${t.assignedTo ?? "q"}`} className="wf-full-task">
                      <div className="wf-full-task-id wf-mono">{t.label}</div>
                      <div className="wf-full-task-location">
                        <strong>{t.locLabel}</strong>
                        <span>→ Inventory{t.assignedTo ? ` · Robot R${t.assignedTo}` : " · Unassigned"}</span>
                      </div>
                      <div className="wf-full-task-meta">
                        <span>Weight: <b>{t.weight}</b></span>
                        <span>Priority: <b>{PRIORITY_LABEL[t.priority]}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeNav === "events" && (
            <section className="wf-page-view">
              <div className="wf-page-header">
                <div>
                  <div className="wf-page-eyebrow">SYSTEM MONITOR</div>
                  <h2>Event Log</h2>
                  <p>Real-time fleet activity and coordination events</p>
                </div>
                <div className="wf-page-count wf-mono">{state.log.length} EVENTS</div>
              </div>
              <div className="wf-page-panel">
                <div className="wf-full-log">
                  {state.log.map((e) => (
                    <div key={e.id} className="wf-full-log-item" style={{ borderLeftColor: e.level === "success" ? "#58D98B" : e.level === "warn" ? "#F4B23F" : e.level === "danger" ? "#FF6470" : "#2b4353" }}>
                      <span className="wf-event-tick wf-mono">T{e.tick}</span>
                      <span className="wf-event-message">{e.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeNav === "analytics" && (
            <section className="wf-page-view">
              <div className="wf-page-header">
                <div>
                  <div className="wf-page-eyebrow">FLEET INTELLIGENCE</div>
                  <h2>Fleet Analytics</h2>
                  <p>Performance, workload and resource utilization</p>
                </div>
              </div>

              <div className="wf-analytics wf-analytics-page">
                <div className="wf-analytic"><div className="wf-analytic-label">Active Tasks</div><div className="wf-analytic-value wf-mono">{activeTaskCount}</div><div className="wf-analytic-sub">queued + assigned</div></div>
                <div className="wf-analytic"><div className="wf-analytic-label">Completed Tasks</div><div className="wf-analytic-value wf-mono">{state.stats.completed}</div><div className="wf-analytic-sub">successful deliveries</div></div>
                <div className="wf-analytic"><div className="wf-analytic-label">Total Workload</div><div className="wf-analytic-value wf-mono">{totalWorkload}</div><div className="wf-analytic-sub">weight units across fleet</div></div>
                <div className="wf-analytic"><div className="wf-analytic-label">Fleet Utilization</div><div className="wf-analytic-value wf-mono">{fleetEfficiency}%</div><div className="wf-analytic-sub">robots currently active</div></div>
                <div className="wf-analytic"><div className="wf-analytic-label">Average Battery</div><div className="wf-analytic-value wf-mono" style={{ color: batteryColor(avgBattery) }}>{avgBattery}%</div><div className="wf-analytic-sub">fleet-wide average</div></div>
                <div className="wf-analytic"><div className="wf-analytic-label">Workload Transfers</div><div className="wf-analytic-value wf-mono">{state.stats.handovers}</div><div className="wf-analytic-sub">battery-driven handovers</div></div>
                <div className="wf-analytic"><div className="wf-analytic-label">Robot Failures</div><div className="wf-analytic-value wf-mono">{state.stats.failures || 0}</div><div className="wf-analytic-sub">injected faults</div></div>
              </div>

              {/* ===================== ANALYTICS CHARTS ===================== */}
              <div className="wf-charts-grid">
                <div className="wf-page-panel wf-chart-panel">
                  <h3 className="wf-chart-title">Throughput Over Time</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1d2a35" />
                      <XAxis dataKey="tick" stroke="#71818d" fontSize={10} />
                      <YAxis stroke="#71818d" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#0c131a", border: "1px solid #1d2a35", fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="completed" stroke="#58d98b" name="Completed" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="handovers" stroke="#f4b23f" name="Handovers" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="failures" stroke="#ff6470" name="Failures" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="wf-page-panel wf-chart-panel">
                  <h3 className="wf-chart-title">Fleet Battery Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1d2a35" />
                      <XAxis dataKey="tick" stroke="#71818d" fontSize={10} />
                      <YAxis stroke="#71818d" fontSize={10} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "#0c131a", border: "1px solid #1d2a35", fontSize: 11 }} />
                      <Line type="monotone" dataKey="avgBattery" stroke="#4fd1e8" name="Avg Battery %" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="wf-page-panel wf-chart-panel">
                  <h3 className="wf-chart-title">Task Queue Depth</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1d2a35" />
                      <XAxis dataKey="tick" stroke="#71818d" fontSize={10} />
                      <YAxis stroke="#71818d" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#0c131a", border: "1px solid #1d2a35", fontSize: 11 }} />
                      <Line type="monotone" dataKey="queueLength" stroke="#a879ff" name="Queued Tasks" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="wf-page-panel wf-chart-panel">
                  <h3 className="wf-chart-title">Per-Robot Workload</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={perRobotWorkload}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1d2a35" />
                      <XAxis dataKey="name" stroke="#71818d" fontSize={10} />
                      <YAxis stroke="#71818d" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#0c131a", border: "1px solid #1d2a35", fontSize: 11 }} />
                      <Bar dataKey="workload" fill="#20a9ff" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* =================== END ANALYTICS CHARTS =================== */}
            </section>
          )}

          {activeNav === "settings" && (
            <section className="wf-page-view">
              <div className="wf-page-header">
                <div>
                  <div className="wf-page-eyebrow">FLEET CONFIGURATION</div>
                  <h2>Fleet Settings</h2>
                  <p>Deploy robots and tune individual operating efficiency.</p>
                </div>
                <div className="wf-page-count wf-mono">{settingsRobotCount} ROBOTS</div>
              </div>
              <div className="wf-page-panel">
                <div className="wf-settings-grid">
                  <section className="wf-settings-card">
                    <div className="wf-settings-card-head">
                      <div>
                        <div className="wf-panel-kicker">FLEET SIZE</div>
                        <h3>Deploy robots</h3>
                      </div>
                      <div className="wf-settings-number wf-mono">{settingsRobotCount}</div>
                    </div>
                    <p className="wf-settings-help">Choose how many AMRs are active in the simulation. You can deploy 1–10 robots.</p>
                    <input className="wf-range" type="range" min="1" max="10" step="1" value={settingsRobotCount} onChange={(e) => setSettingsRobotCount(Number(e.target.value))} />
                    <div className="wf-range-labels wf-mono"><span>1</span><span>5</span><span>10</span></div>
                  </section>
                  <section className="wf-settings-card">
                    <div className="wf-settings-card-head">
                      <div>
                        <div className="wf-panel-kicker">ROBOT PERFORMANCE</div>
                        <h3>Efficiency</h3>
                      </div>
                      <button className="wf-btn" onClick={() => setSettingsEfficiency(Array(10).fill(100))}>Set all 100%</button>
                    </div>
                    <p className="wf-settings-help">100% is maximum movement speed. 0% means the robot is stopped.</p>
                    <div className="wf-efficiency-list">
                      {Array.from({ length: settingsRobotCount }, (_, i) => (
                        <div className="wf-efficiency-row" key={i}>
                          <div className="wf-efficiency-name"><span className="wf-robot-dot" style={{ color: ROBOT_COLORS[i % ROBOT_COLORS.length] }} />R{i + 1}</div>
                          <input
                            className="wf-range"
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={settingsEfficiency[i] ?? 100}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              setSettingsEfficiency((prev) => {
                                const next = [...prev];
                                next[i] = value;
                                return next;
                              });
                            }}
                          />
                          <div className="wf-efficiency-value wf-mono">{settingsEfficiency[i] ?? 100}%</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="wf-settings-actions">
                  <div className="wf-settings-note"><Zap size={13} /> Applying fleet settings resets the simulation and starts paused.</div>
                  <button className="wf-btn primary" onClick={applyFleetSettings}>
                    <Settings size={14} /> Deploy {settingsRobotCount} Robot{settingsRobotCount === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}