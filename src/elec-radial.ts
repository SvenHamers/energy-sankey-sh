import {
  CSSResultGroup,
  TemplateResult,
  css,
  html,
  nothing,
  svg,
  PropertyValues,
} from "lit";
import {
  mdiSolarPower,
  mdiTransmissionTower,
  mdiBattery,
  mdiBatteryCharging,
  mdiHome,
  mdiFlash,
} from "@mdi/js";
import { customElement, property, state } from "lit/decorators.js";
import { ElecSankey, ElecRoute } from "./elec-sankey";

const UNTRACKED_ID = "untracked";

interface NodeData {
  id?: string;
  icon: string;
  label: string;
  sublabel?: string;
  value: number;
  color: string;
  cssClass: string;
  active: boolean;
  diameter: number;
}

interface LineData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  duration: number; // animation duration in seconds (lower = faster)
  color: string;
  animated: boolean;
}

@customElement("elec-radial")
export class ElecRadial extends ElecSankey {
  @property({ attribute: false })
  public batterySoc?: number; // Battery state of charge 0-100

  @state() private _lines: LineData[] = [];

  private _resizeObserver?: ResizeObserver;

  private _colors = {
    solar: "#f5a623",
    grid: "#4a90d9",
    battery: "#4ecdc4",
    consumer: "#4ecdc4",
  };

  connectedCallback() {
    super.connectedCallback();
    this._resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => this._updateLines());
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  protected firstUpdated(_changedProps: PropertyValues) {
    const flowArea = this.renderRoot?.querySelector(".flow-area");
    if (flowArea) {
      this._resizeObserver?.observe(flowArea);
    }
  }

  protected updated(changedProps: PropertyValues) {
    if (!changedProps.has("_lines")) {
      requestAnimationFrame(() => this._updateLines());
    }
  }

  private _resolveColors() {
    if (!this.isConnected) return;
    const style = getComputedStyle(this);
    const gen = style.getPropertyValue("--generation-color").trim();
    const grid = style.getPropertyValue("--grid-in-color").trim();
    const batt = style.getPropertyValue("--batt-in-color").trim();
    if (gen) this._colors.solar = gen;
    if (grid) this._colors.grid = grid;
    if (batt) this._colors.battery = batt;
    this._colors.consumer = this._colors.battery;
  }

  private _updateLines() {
    const flowArea = this.renderRoot?.querySelector(".flow-area");
    const homeCircle = this.renderRoot?.querySelector(
      ".home-node .node-circle"
    );
    if (!flowArea || !homeCircle) return;

    const containerRect = flowArea.getBoundingClientRect();
    const homeRect = homeCircle.getBoundingClientRect();
    const homeCx = homeRect.left + homeRect.width / 2 - containerRect.left;
    const homeCy = homeRect.top + homeRect.height / 2 - containerRect.top;

    const lines: LineData[] = [];
    const maxSourceRate = Math.max(
      this._generationTotal(),
      this._gridImport(),
      this._batteryInTotal(),
      1
    );

    const homeTotal =
      this._generationToConsumersRate +
      this._gridToConsumersRate +
      this._batteriesToConsumersRate;

    // Source -> Home lines
    this.renderRoot?.querySelectorAll(".source-node").forEach((el) => {
      const circle = el.querySelector(".node-circle");
      if (!circle) return;
      const r = circle.getBoundingClientRect();
      const cx = r.left + r.width / 2 - containerRect.left;
      const cy = r.top + r.height / 2 - containerRect.top;
      const rate = parseFloat((el as HTMLElement).dataset.rate || "0");
      const color = (el as HTMLElement).dataset.color || "#4ecdc4";
      const duration = this._rateToDuration(rate, maxSourceRate);
      if (rate > 0) {
        lines.push({
          x1: cx,
          y1: cy,
          x2: homeCx,
          y2: homeCy,
          duration,
          color,
          animated: true,
        });
      }
    });

    // Home -> Consumer lines
    this.renderRoot?.querySelectorAll(".consumer-node").forEach((el) => {
      const circle = el.querySelector(".node-circle");
      if (!circle) return;
      const r = circle.getBoundingClientRect();
      const cx = r.left + r.width / 2 - containerRect.left;
      const cy = r.top + r.height / 2 - containerRect.top;
      const rate = parseFloat((el as HTMLElement).dataset.rate || "0");
      const color = (el as HTMLElement).dataset.color || "#4ecdc4";
      const duration = this._rateToDuration(rate, homeTotal || 1);
      if (rate > 0) {
        lines.push({
          x1: homeCx,
          y1: homeCy,
          x2: cx,
          y2: cy,
          duration,
          color,
          animated: true,
        });
      }
    });

    this._lines = lines;
  }

  private _rateToDuration(rate: number, maxRate: number): number {
    // Higher rate = faster animation (shorter duration)
    // Range: 0.3s (fastest) to 4s (slowest)
    if (rate <= 0 || maxRate <= 0) return 4;
    const ratio = rate / maxRate;
    return 4 - ratio * 3.7; // 4s at 0%, 0.3s at 100%
  }

  protected _formatValue(value: number): string {
    const digits = this.unit === "kWh" ? 1 : 0;
    return value.toFixed(digits) + " " + this.unit;
  }

  protected _onNodeClick(_entityId?: string) {
    // Override in HA subclass
  }

  private _prepareSources(): NodeData[] {
    const sources: NodeData[] = [];

    // Solar / Generation
    const genTotal = this._generationTrackedTotal();
    const hasGen =
      Object.keys(this.generationInRoutes).length > 0 ||
      this._phantomGenerationInRoute;
    if (hasGen) {
      const firstGen = Object.values(this.generationInRoutes)[0];
      sources.push({
        id: firstGen?.id,
        icon: firstGen?.icon || mdiSolarPower,
        label: this._localize("solar", "Solar"),
        sublabel: genTotal > 0 ? undefined : "inactive",
        value: genTotal,
        color: this._colors.solar,
        cssClass: "solar",
        active: genTotal > 0,
        diameter: 75,
      });
    }

    // Grid
    const gridIn = this._gridImport();
    const gridOut = this._gridExport;
    const hasGrid =
      this.gridInRoute !== undefined ||
      this.gridOutRoute !== undefined ||
      this._phantomGridInRoute !== undefined;
    if (hasGrid) {
      let sublabel = "idle";
      if (gridIn > 0 && gridOut > 0) sublabel = "importing & exporting";
      else if (gridIn > 0) sublabel = "\u2193 importing";
      else if (gridOut > 0) sublabel = "\u2191 exporting";
      sources.push({
        id: this.gridInRoute?.id || this.gridOutRoute?.id,
        icon: mdiTransmissionTower,
        label: this._localize("grid", "Grid"),
        sublabel,
        value: gridIn > 0 ? gridIn : gridOut,
        color: this._colors.grid,
        cssClass: "grid",
        active: gridIn > 0 || gridOut > 0,
        diameter: 75,
      });
    }

    // Battery
    const battIn = this._batteryInTotal();
    const battOut = this._batteryOutTotal();
    if (Object.keys(this.batteryRoutes).length > 0) {
      let sublabel = "";
      if (this.batterySoc !== undefined) {
        sublabel = `${Math.round(this.batterySoc)}% \u00B7 `;
      }
      if (battIn > 0 && battOut > 0) sublabel += "active";
      else if (battIn > 0) sublabel += "\u2191 discharging";
      else if (battOut > 0) sublabel += "\u2193 charging";
      else sublabel += "idle";
      sources.push({
        icon: battOut > 0 ? mdiBatteryCharging : mdiBattery,
        label: this._localize("battery", "Battery"),
        sublabel,
        value: Math.max(battIn, battOut),
        color: this._colors.battery,
        cssClass: "battery",
        active: battIn > 0 || battOut > 0,
        diameter: 75,
      });
    }

    return sources;
  }

  private _prepareConsumers(): NodeData[] {
    const consumers: NodeData[] = [];
    const groupedRoutes = this._getGroupedConsumerRoutes();
    const homeTotal =
      this._generationToConsumersRate +
      this._gridToConsumersRate +
      this._batteriesToConsumersRate;

    if (this._untrackedConsumerRoute.rate > 0) {
      const copy = { ...this._untrackedConsumerRoute };
      copy.text = this._localize("untracked", "Untracked");
      groupedRoutes[UNTRACKED_ID] = copy;
    }

    // Find max consumer rate for proportional sizing
    let maxConsumerRate = 0;
    for (const id in groupedRoutes) {
      maxConsumerRate = Math.max(maxConsumerRate, groupedRoutes[id].rate || 0);
    }
    if (this._untrackedConsumerRoute.rate > 0) {
      maxConsumerRate = Math.max(maxConsumerRate, this._untrackedConsumerRoute.rate);
    }

    const numConsumers = Object.keys(groupedRoutes).length +
      (this._untrackedConsumerRoute.rate > 0 ? 1 : 0);
    // Base sizes scale down when many consumers
    const maxDiam = numConsumers > 7 ? 58 : numConsumers > 5 ? 65 : 70;
    const minDiam = numConsumers > 7 ? 30 : numConsumers > 5 ? 32 : 36;

    for (const id in groupedRoutes) {
      const route = groupedRoutes[id];
      const rate = route.rate || 0;
      const pct =
        homeTotal > 0 ? ((rate / homeTotal) * 100).toFixed(1) : "0";
      // Scale diameter proportionally: sqrt scaling for area-proportional feel
      const ratio = maxConsumerRate > 0 ? rate / maxConsumerRate : 0;
      const diameter = Math.round(minDiam + Math.sqrt(ratio) * (maxDiam - minDiam));
      consumers.push({
        id: route.id,
        icon: route.icon || mdiFlash,
        label: route.text || id,
        sublabel: `${pct} % of load`,
        value: rate,
        color: this._colors.consumer,
        cssClass: "consumer",
        active: rate > 0,
        diameter,
      });
    }

    return consumers;
  }

  protected render(): TemplateResult {
    this._recalculate();
    this._resolveColors();

    const sources = this._prepareSources();
    const consumers = this._prepareConsumers();
    const homeTotal =
      this._generationToConsumersRate +
      this._gridToConsumersRate +
      this._batteriesToConsumersRate;

    // Home sublabel: source percentage breakdown
    const parts: string[] = [];
    if (homeTotal > 0) {
      if (this._batteriesToConsumersRate > 0) {
        const pct = (
          (this._batteriesToConsumersRate / homeTotal) *
          100
        ).toFixed(1);
        parts.push(`bat ${pct}%`);
      }
      if (this._gridToConsumersRate > 0) {
        const pct = (
          (this._gridToConsumersRate / homeTotal) *
          100
        ).toFixed(1);
        parts.push(`grid ${pct}%`);
      }
      if (this._generationToConsumersRate > 0) {
        const pct = (
          (this._generationToConsumersRate / homeTotal) *
          100
        ).toFixed(1);
        parts.push(`solar ${pct}%`);
      }
    }
    const homeSublabel = parts.join(" \u00B7 ");

    // Height based on sources (always vertical), consumers wrap horizontally
    const containerHeight = Math.max(300, sources.length * 130 + 50);

    return html`
      <div
        class="radial-container"
        style="min-height: ${containerHeight}px"
      >
        <div class="headers">
          <span class="header">S O U R C E S</span>
          <span class="header">H O M E</span>
          <span class="header">C O N S U M E R S</span>
        </div>

        <div class="flow-area">
          <svg class="connections" width="100%" height="100%">
            ${this._lines.map(
              (line) => svg`
              <line
                x1="${line.x1}" y1="${line.y1}"
                x2="${line.x2}" y2="${line.y2}"
                stroke="${line.color}"
                stroke-width="2"
                stroke-dasharray="8 5"
                stroke-linecap="round"
                opacity="${line.animated ? 0.6 : 0.2}"
                style="animation: dash-flow ${line.duration}s linear infinite"
              />`
            )}
          </svg>

          <div class="sources-column">
            ${sources.map(
              (s) => html`
                <div
                  class="node source-node"
                  data-rate="${s.value}"
                  data-color="${s.color}"
                  @click=${() => this._onNodeClick(s.id)}
                >
                  <div
                    class="node-circle ${s.cssClass} ${s.active
                      ? "active"
                      : "inactive"}"
                    style="width:${s.diameter}px; height:${s.diameter}px"
                  >
                    <svg
                      class="node-icon"
                      viewBox="0 0 24 24"
                      width="${s.diameter * 0.34}"
                      height="${s.diameter * 0.34}"
                    >
                      <path d="${s.icon}" fill="currentColor" />
                    </svg>
                    <span class="node-value"
                      >${s.active
                        ? this._formatValue(s.value)
                        : "0 " + this.unit}</span
                    >
                  </div>
                  <span class="node-label">${s.label}</span>
                  ${s.sublabel
                    ? html`<span class="node-sublabel"
                        >${s.sublabel}</span
                      >`
                    : nothing}
                </div>
              `
            )}
          </div>

          <div class="home-column">
            <div class="node home-node">
              <div
                class="node-circle home active"
                style="width:110px; height:110px"
              >
                <svg
                  class="node-icon"
                  viewBox="0 0 24 24"
                  width="34"
                  height="34"
                >
                  <path d="${mdiHome}" fill="currentColor" />
                </svg>
                <span class="node-value home-value"
                  >${this._formatValue(homeTotal)}</span
                >
              </div>
              ${homeSublabel
                ? html`<span class="node-sublabel home-sublabel"
                    >${homeSublabel}</span
                  >`
                : nothing}
            </div>
          </div>

          <div class="consumers-column">
            ${consumers.map(
              (c) => html`
                <div
                  class="node consumer-node"
                  data-rate="${c.value}"
                  data-color="${c.color}"
                  @click=${() => this._onNodeClick(c.id)}
                >
                  <div
                    class="node-circle consumer ${c.active
                      ? "active"
                      : "inactive"}"
                    style="width:${c.diameter}px; height:${c.diameter}px"
                  >
                    <svg
                      class="node-icon"
                      viewBox="0 0 24 24"
                      width="${c.diameter * 0.32}"
                      height="${c.diameter * 0.32}"
                    >
                      <path d="${c.icon}" fill="currentColor" />
                    </svg>
                    <span class="node-value"
                      >${this._formatValue(c.value)}</span
                    >
                  </div>
                  <span class="node-label">${c.label}</span>
                  ${c.sublabel
                    ? html`<span class="node-sublabel"
                        >${c.sublabel}</span
                      >`
                    : nothing}
                </div>
              `
            )}
          </div>
        </div>

        <div class="legend">
          <div class="legend-items">
            ${sources
              .filter((s) => s.value > 0)
              .map((s) => {
                const pct =
                  homeTotal > 0
                    ? ((s.value / homeTotal) * 100).toFixed(1)
                    : "0";
                return html`
                  <span class="legend-item">
                    <span
                      class="legend-dot"
                      style="background:${s.color}"
                    ></span>
                    ${s.label} \u00B7 ${this._formatValue(s.value)}
                    \u00B7 ${pct}%
                  </span>
                `;
              })}
            ${sources
              .filter((s) => s.value === 0)
              .map(
                (s) => html`
                  <span class="legend-item inactive">
                    <span
                      class="legend-dot"
                      style="background:${s.color}"
                    ></span>
                    ${s.label} \u00B7 0 ${this.unit} \u00B7 inactive
                  </span>
                `
              )}
            <span class="legend-note"
              >Line speed = power flow</span
            >
          </div>
        </div>
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
      }

      .radial-container {
        padding: 16px 8px 12px;
      }

      /* Headers */
      .headers {
        display: flex;
        justify-content: space-between;
        padding: 0 10%;
        margin-bottom: 16px;
      }

      .header {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 2px;
        opacity: 0.35;
        color: var(--primary-text-color, #b0bec5);
      }

      /* Flow area layout */
      .flow-area {
        display: flex;
        position: relative;
        align-items: stretch;
      }

      .connections {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
        overflow: visible;
      }

      @keyframes dash-flow {
        from {
          stroke-dashoffset: 13;
        }
        to {
          stroke-dashoffset: 0;
        }
      }

      /* Columns */
      .sources-column {
        flex: 0 0 20%;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        align-items: center;
        position: relative;
        z-index: 2;
        padding: 10px 0;
        min-height: 200px;
      }

      .consumers-column {
        flex: 0 0 40%;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        align-content: center;
        gap: 4px 8px;
        position: relative;
        z-index: 2;
        padding: 10px 0;
        min-height: 200px;
      }

      .home-column {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 2;
      }

      /* Nodes */
      .node {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 4px 2px;
      }

      .node-circle {
        border-radius: 50%;
        border: 2px solid;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        transition: all 0.4s ease;
        background: rgba(0, 0, 0, 0.15);
        position: relative;
      }

      /* Source type colors & glow */
      .node-circle.solar {
        border-color: var(--generation-color, #f5a623);
        color: var(--generation-color, #f5a623);
      }
      .node-circle.solar.active {
        box-shadow:
          0 0 25px rgba(245, 166, 35, 0.25),
          0 0 50px rgba(245, 166, 35, 0.1),
          inset 0 0 15px rgba(245, 166, 35, 0.08);
      }
      .node-circle.solar.inactive {
        background: rgba(245, 166, 35, 0.05);
      }

      .node-circle.grid {
        border-color: var(--grid-in-color, #4a90d9);
        color: var(--grid-in-color, #4a90d9);
      }
      .node-circle.grid.active {
        box-shadow:
          0 0 25px rgba(74, 144, 217, 0.25),
          0 0 50px rgba(74, 144, 217, 0.1),
          inset 0 0 15px rgba(74, 144, 217, 0.08);
      }

      .node-circle.battery {
        border-color: var(--batt-in-color, #4ecdc4);
        color: var(--batt-in-color, #4ecdc4);
      }
      .node-circle.battery.active {
        box-shadow:
          0 0 25px rgba(78, 205, 196, 0.25),
          0 0 50px rgba(78, 205, 196, 0.1),
          inset 0 0 15px rgba(78, 205, 196, 0.08);
      }

      .node-circle.consumer {
        border-color: var(--batt-in-color, #4ecdc4);
        color: var(--batt-in-color, #4ecdc4);
      }
      .node-circle.consumer.active {
        box-shadow:
          0 0 20px rgba(78, 205, 196, 0.2),
          0 0 40px rgba(78, 205, 196, 0.08),
          inset 0 0 12px rgba(78, 205, 196, 0.06);
      }

      .node-circle.home {
        border-width: 3px;
        border-color: rgba(150, 170, 200, 0.35);
        color: rgba(200, 215, 235, 0.85);
        background: rgba(30, 40, 60, 0.4);
        box-shadow:
          0 0 40px rgba(150, 170, 200, 0.1),
          0 0 80px rgba(150, 170, 200, 0.05),
          inset 0 0 25px rgba(150, 170, 200, 0.04);
      }

      .node-circle.inactive {
        border-style: dashed;
        opacity: 0.4;
      }

      .node-icon {
        flex-shrink: 0;
      }

      .node-value {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        white-space: nowrap;
      }

      .home-value {
        font-size: 14px;
        color: rgba(200, 215, 235, 0.95);
      }

      .node-label {
        margin-top: 3px;
        font-size: 10px;
        color: var(--primary-text-color, #b0bec5);
        opacity: 0.7;
        max-width: 90px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-sublabel {
        font-size: 9px;
        color: var(--secondary-text-color, #78909c);
        opacity: 0.5;
        margin-top: 1px;
      }

      .home-sublabel {
        margin-top: 6px;
        font-size: 10px;
        opacity: 0.4;
      }

      /* Legend */
      .legend {
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }

      .legend-items {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: var(--secondary-text-color, #78909c);
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .legend-item.inactive {
        opacity: 0.4;
      }

      .legend-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .legend-note {
        opacity: 0.3;
        font-style: italic;
        margin-left: 8px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "elec-radial": ElecRadial;
  }
}
