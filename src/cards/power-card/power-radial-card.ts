import { HassEntity } from "home-assistant-js-websocket/dist/types";
import {
  css,
  html,
  LitElement,
  PropertyValues,
  nothing,
  CSSResultArray,
  TemplateResult,
} from "lit";
import { mdiSolarPower } from "@mdi/js";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ElecRoute, ElecRoutePair } from "../../elec-sankey";
import { applyThemesOnElement } from "../../ha/common/dom/apply_themes_on_element";
import { computeStateName } from "../../ha/common/entity/compute_state_name";
import type { HomeAssistant } from "../../ha/types";
import { createEntityNotFoundWarning } from "../../ha/panels/lovelace/components/hui-warning";
import type {
  LovelaceCard,
  LovelaceCardEditor,
} from "../../ha/panels/lovelace/types";
import type { PowerFlowCardConfig } from "../../types";
import { hasConfigChanged } from "../../ha/panels/lovelace/common/has-changed";
import { registerCustomCard } from "../../utils/custom-cards";
import { getEnergyPreferences, EnergyPreferences } from "../../ha/data/energy";
import {
  ExtEntityRegistryEntry,
  getExtendedEntityRegistryEntry,
} from "../../ha/data/entity_registry";

import {
  POWER_CARD_EDITOR_NAME,
  HIDE_CONSUMERS_BELOW_THRESHOLD_W,
} from "./const";
import { ElecFlowCardBase } from "../../shared/elec-flow-card-base";
import { setupCustomlocalize } from "../../localize";
import { verifyAndMigrateConfig } from "./power-flow-card";

const RADIAL_POWER_CARD_NAME = "energy-sankey-radial-power-flow-card";

registerCustomCard({
  type: RADIAL_POWER_CARD_NAME,
  name: "Radial Power Flow Card",
  description: "Card for showing the instantaneous flow of electrical power in a radial layout",
});

function computePower(stateObj: HassEntity): number {
  let uom: string | undefined;
  let state: number = Number(stateObj.state);
  if ((uom = stateObj.attributes.unit_of_measurement)) {
    switch (uom) {
      case "kW": {
        return 1000 * state;
      }
      default: {
        return state;
      }
    }
  } else {
    return state;
  }
}

@customElement(RADIAL_POWER_CARD_NAME)
export class RadialPowerFlowCard extends ElecFlowCardBase implements LovelaceCard {
  @state() protected _config?: PowerFlowCardConfig;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./power-flow-card-editor");
    return document.createElement(POWER_CARD_EDITOR_NAME) as LovelaceCardEditor;
  }

  public getCardSize(): number {
    return 3;
  }

  public setConfig(config: PowerFlowCardConfig): void {
    this._config = {
      ...config,
      consumer_entities: config.consumer_entities || [],
      battery_entities: config.battery_entities || [],
      config_version: 3,
    };
  }

  protected _getValues(
    config: PowerFlowCardConfig
  ):
    | [
        ElecRoute | null,
        ElecRoute | null,
        { [id: string]: ElecRoute },
        { [id: string]: ElecRoute },
        { [id: string]: ElecRoutePair },
      ]
    | TemplateResult {
    config.generation_entities = config.generation_entity
      ? [config.generation_entity]
      : [];

    let gridInRoute: ElecRoute | null = null;
    if (config.power_from_grid_entity) {
      const stateObj = this.hass.states[config.power_from_grid_entity];
      if (!stateObj) {
        return html`<hui-warning>${createEntityNotFoundWarning(this.hass, config.power_from_grid_entity)}</hui-warning>`;
      }
      gridInRoute = {
        id: config.power_from_grid_entity,
        text: computeStateName(stateObj),
        rate: computePower(stateObj),
      };
    }

    let gridOutRoute: ElecRoute | null = null;
    if (config.independent_grid_in_out && config.power_to_grid_entity) {
      const stateObj = this.hass.states[config.power_to_grid_entity];
      if (!stateObj) {
        return html`<hui-warning>${createEntityNotFoundWarning(this.hass, config.power_to_grid_entity)}</hui-warning>`;
      }
      gridOutRoute = {
        id: config.power_to_grid_entity,
        text: computeStateName(stateObj),
        rate: computePower(stateObj),
      };
    }

    const generationInRoutes: { [id: string]: ElecRoute } = {};
    for (const entity of config.generation_entities) {
      if (!entity) continue;
      const stateObj = this.hass.states[entity];
      if (!stateObj) {
        return html`<hui-warning>${createEntityNotFoundWarning(this.hass, entity)}</hui-warning>`;
      }
      generationInRoutes[entity] = {
        id: entity,
        text: computeStateName(stateObj),
        rate: computePower(stateObj),
        icon: mdiSolarPower,
      };
    }

    const consumerRoutes: { [id: string]: ElecRoute } = {};
    if (config.consumer_entities) {
      for (const entity of config.consumer_entities) {
        const stateObj = this.hass.states[entity.entity];
        if (!stateObj) {
          return html`<hui-warning>${createEntityNotFoundWarning(this.hass, entity.entity)}</hui-warning>`;
        }
        consumerRoutes[entity.entity] = {
          id: entity.entity,
          text: entity.name || computeStateName(stateObj),
          rate: computePower(stateObj),
        };
      }
    }

    const batteryRoutes: { [id: string]: ElecRoutePair } = {};
    if (config.battery_entities) {
      for (const entity of config.battery_entities) {
        const stateObj = this.hass.states[entity.entity];
        if (!stateObj) {
          return html`<hui-warning>${createEntityNotFoundWarning(this.hass, entity.entity)}</hui-warning>`;
        }
        let powerIn = (config.invert_battery_flows ? -1 : 1) * computePower(stateObj);
        batteryRoutes[entity.entity] = {
          in: {
            id: entity.entity,
            text: entity.name || computeStateName(stateObj),
            rate: powerIn > 0 ? powerIn : 0,
          },
          out: {
            id: "null",
            text: "null",
            rate: powerIn < 0 ? -powerIn : 0,
          },
        };
      }
    }
    return [gridInRoute, gridOutRoute, generationInRoutes, consumerRoutes, batteryRoutes];
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const config = this._config;
    const res = this._getValues(config);
    if (!Array.isArray(res)) {
      return res;
    }
    const [gridInRoute, gridOutRoute, generationInRoutes, consumerRoutes, batteryRoutes] = res;
    const maxConsumerBranches = this._config.max_consumer_branches || 0;
    const hideConsumersBelow = this._config.hide_small_consumers
      ? HIDE_CONSUMERS_BELOW_THRESHOLD_W
      : 0;
    const batteryChargeOnlyFromGeneration =
      this._config.battery_charge_only_from_generation || false;

    // Get battery SoC from configured entity or auto-detect
    let batterySoc: number | undefined;
    if (this._config.battery_soc_entity) {
      const socState = this.hass.states[this._config.battery_soc_entity];
      if (socState) {
        batterySoc = Number(socState.state);
      }
    }

    return html`
      <ha-card>
        ${config.title ? html`<h1 class="card-header">${config.title}</h1>` : ""}
        <div class="content ${classMap({ "has-header": !!this._config.title })}">
          <ha-elec-radial
            .hass=${this.hass}
            .unit=${"W"}
            .gridInRoute=${gridInRoute || undefined}
            .gridOutRoute=${gridOutRoute || undefined}
            .generationInRoutes=${generationInRoutes}
            .consumerRoutes=${consumerRoutes}
            .batteryRoutes=${batteryRoutes}
            .batterySoc=${batterySoc}
            .maxConsumerBranches=${maxConsumerBranches}
            .hideConsumersBelow=${hideConsumersBelow}
            .batteryChargeOnlyFromGeneration=${batteryChargeOnlyFromGeneration}
          ></ha-elec-radial>
        </div>
      </ha-card>
    `;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (hasConfigChanged(this, changedProps)) {
      return true;
    }
    if (!changedProps.has("hass")) {
      return false;
    }
    const oldHass = changedProps.get("hass") as HomeAssistant;
    const newHass = this.hass as HomeAssistant;
    if (this._config) {
      for (const id of [
        this._config.power_from_grid_entity,
        this._config.power_to_grid_entity,
        ...(this._config.generation_entities || []),
        ...(this._config.consumer_entities.map((a) => a.entity) || []),
        this._config.battery_soc_entity,
        ...(this._config.battery_entities.map((a) => a.entity) || []),
      ]) {
        if (id) {
          const oldState = oldHass.states[id] as HassEntity | undefined;
          const newState = newHass.states[id] as HassEntity | undefined;
          if (oldState !== newState) return true;
        }
      }
    }
    return false;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._config || !this.hass) return;
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    const oldConfig = changedProps.get("_config") as PowerFlowCardConfig | undefined;
    if (!oldHass || !oldConfig || oldHass.themes !== this.hass.themes || oldConfig.theme !== this._config.theme) {
      applyThemesOnElement(this, this.hass.themes, this._config.theme);
    }
  }

  static styles: CSSResultArray = [
    css`
      ha-card {
        height: 100%;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        box-sizing: border-box;
        padding-bottom: 16px;
      }
      ha-elec-radial {
        --generation-color: var(--energy-solar-color);
        --grid-in-color: var(--energy-grid-consumption-color);
        --batt-in-color: var(--energy-battery-out-color);
      }
    `,
  ];
}
