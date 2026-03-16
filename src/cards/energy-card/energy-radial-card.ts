import { mdiSolarPower } from "@mdi/js";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, CSSResultArray, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

import type { ElecRoute, ElecRoutePair } from "../../elec-sankey";
import {
  BatterySourceTypeEnergyPreference,
  DeviceConsumptionEnergyPreference,
  EnergyData,
  energySourcesByType,
  getEnergyDataCollection,
  SolarSourceTypeEnergyPreference,
} from "../../ha/data/energy";
import {
  calculateStatisticsSumGrowth,
  getStatisticLabel,
} from "../../ha/data/recorder";
import { HomeAssistant } from "../../ha/types";
import type {
  LovelaceCard,
  LovelaceCardEditor,
} from "../../ha/panels/lovelace/types";
import { EnergyElecFlowCardConfig } from "../../types";
import { registerCustomCard } from "../../utils/custom-cards";
import {
  ENERGY_CARD_EDITOR_NAME,
  HIDE_CONSUMERS_BELOW_THRESHOLD_KWH,
} from "./const";
import { ElecFlowCardBase } from "../../shared/elec-flow-card-base";
import { setupCustomlocalize } from "../../localize";
import { verifyAndMigrateConfig } from "./energy-elec-flow-card";

const RADIAL_ENERGY_CARD_NAME = "energy-sankey-radial-energy-flow-card";

registerCustomCard({
  type: RADIAL_ENERGY_CARD_NAME,
  name: "Radial Energy Flow Card",
  description: "Card for showing the flow of electrical energy over a time period in a radial layout",
});

@customElement(RADIAL_ENERGY_CARD_NAME)
export class RadialEnergyElecFlowCard
  extends ElecFlowCardBase
  implements LovelaceCard
{
  @state() private _config?: EnergyElecFlowCardConfig;
  @state() private _gridInRoute?: ElecRoute;
  @state() private _gridOutRoute?: ElecRoute;
  @state() private _generationInRoutes: { [id: string]: ElecRoute } = {};
  @state() private _consumerRoutes: { [id: string]: ElecRoute } = {};
  @state() private _batteryRoutes: { [id: string]: ElecRoutePair } = {};

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => this._getStatistics(data)),
    ];
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./energy-elec-flow-card-editor");
    return document.createElement(ENERGY_CARD_EDITOR_NAME) as LovelaceCardEditor;
  }

  public setConfig(config: EnergyElecFlowCardConfig): void {
    this._config = verifyAndMigrateConfig(config);
  }

  static getStubConfig(hass: HomeAssistant): EnergyElecFlowCardConfig {
    const localize = setupCustomlocalize(hass);
    let config: EnergyElecFlowCardConfig = {
      type: `custom:${RADIAL_ENERGY_CARD_NAME}`,
      title: localize("card.energy_sankey.energy_distribution_today"),
      config_version: 1,
      hide_small_consumers: false,
      max_consumer_branches: 0,
      battery_charge_only_from_generation: false,
    };
    return config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const maxConsumerBranches = this._config.max_consumer_branches || 0;
    const hideConsumersBelow = this._config.hide_small_consumers
      ? HIDE_CONSUMERS_BELOW_THRESHOLD_KWH
      : 0;
    const batteryChargeOnlyFromGeneration =
      this._config.battery_charge_only_from_generation || false;

    return html`
      <ha-card>
        ${this._config.title
          ? html`<h1 class="card-header">${this._config.title}</h1>`
          : ""}
        <div class="content ${classMap({ "has-header": !!this._config.title })}">
          <ha-elec-radial
            .hass=${this.hass}
            .gridInRoute=${this._gridInRoute || undefined}
            .gridOutRoute=${this._gridOutRoute || undefined}
            .generationInRoutes=${this._generationInRoutes || {}}
            .consumerRoutes=${this._consumerRoutes || {}}
            .batteryRoutes=${this._batteryRoutes || {}}
            .maxConsumerBranches=${maxConsumerBranches}
            .hideConsumersBelow=${hideConsumersBelow}
            .batteryChargeOnlyFromGeneration=${batteryChargeOnlyFromGeneration}
          ></ha-elec-radial>
        </div>
      </ha-card>
    `;
  }

  private async _getStatistics(energyData: EnergyData): Promise<void> {
    const solarSources: SolarSourceTypeEnergyPreference[] =
      energyData.prefs.energy_sources.filter(
        (source) => source.type === "solar"
      ) as SolarSourceTypeEnergyPreference[];

    const prefs = energyData.prefs;
    const types = energySourcesByType(prefs);

    if (types.grid && types.grid.length > 0) {
      if (types.grid[0].stat_energy_from) {
        const totalFromGrid =
          calculateStatisticsSumGrowth(energyData.stats, [types.grid[0].stat_energy_from]) ?? 0;
        this._gridInRoute = {
          id: types.grid[0].stat_energy_from,
          rate: totalFromGrid,
        };
      }
      if (types.grid[0].stat_energy_to) {
        const totalToGrid =
          calculateStatisticsSumGrowth(energyData.stats, [types.grid[0].stat_energy_to]) ?? 0;
        this._gridOutRoute = {
          id: types.grid[0].stat_energy_to,
          rate: totalToGrid,
        };
      }
    }

    solarSources.forEach((source) => {
      const label = getStatisticLabel(this.hass, source.stat_energy_from, undefined);
      const value = calculateStatisticsSumGrowth(energyData.stats, [source.stat_energy_from]);
      if (!(source.stat_energy_from in this._generationInRoutes)) {
        this._generationInRoutes[source.stat_energy_from] = {
          id: source.stat_energy_from,
          text: label,
          rate: value ?? 0,
          icon: mdiSolarPower,
        };
      } else {
        this._generationInRoutes[source.stat_energy_from].rate = value ?? 0;
      }
    });

    const consumers: DeviceConsumptionEnergyPreference[] = energyData.prefs
      .device_consumption as DeviceConsumptionEnergyPreference[];

    let consumerBlacklist: string[] = [];
    consumers.forEach((consumer: DeviceConsumptionEnergyPreference) => {
      if (consumer.included_in_stat !== undefined) {
        consumerBlacklist.push(consumer.included_in_stat);
      }
    });

    consumers.forEach((consumer: DeviceConsumptionEnergyPreference) => {
      if (consumerBlacklist.includes(consumer.stat_consumption)) return;
      const label =
        consumer.name || getStatisticLabel(this.hass, consumer.stat_consumption, undefined);
      const value = calculateStatisticsSumGrowth(energyData.stats, [consumer.stat_consumption]);
      if (!(consumer.stat_consumption in this._consumerRoutes)) {
        this._consumerRoutes[consumer.stat_consumption] = {
          id: consumer.stat_consumption,
          text: label,
          rate: value ?? 0,
          icon: undefined,
        };
      } else {
        this._consumerRoutes[consumer.stat_consumption].rate = value ?? 0;
      }
    });

    const batteries: BatterySourceTypeEnergyPreference[] =
      energyData.prefs.energy_sources.filter(
        (source) => source.type === "battery"
      ) as BatterySourceTypeEnergyPreference[];

    batteries.forEach((battery) => {
      const inToSystem = calculateStatisticsSumGrowth(energyData.stats, [battery.stat_energy_from]);
      const outOfSystem = calculateStatisticsSumGrowth(energyData.stats, [battery.stat_energy_to]);
      this._batteryRoutes[battery.stat_energy_from] = {
        in: { id: battery.stat_energy_from, rate: inToSystem ?? 0 },
        out: { id: battery.stat_energy_to, rate: outOfSystem ?? 0 },
      };
    });
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
