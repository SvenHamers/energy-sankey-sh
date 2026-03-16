import { customElement, property } from "lit/decorators.js";
import { CSSResultArray, CSSResultGroup, css } from "lit";
import { ElecRadial } from "./elec-radial";
import { HomeAssistant } from "./ha/types";
import { formatNumber } from "./ha/common/number/format_number";
import { fireEvent } from "./ha/common/dom/fire_event";
import { setupCustomlocalize } from "./localize";

@customElement("ha-elec-radial")
export class HaElecRadial extends ElecRadial {
  @property({ attribute: false }) public hass!: HomeAssistant;

  private _localizer: (key: string) => string = (key: string): string => key;
  private _localizerIsSetup = false;

  protected _localize = (key: string, fallBack?: string): string => {
    if (!this._localizerIsSetup) {
      this._localizer = setupCustomlocalize(this.hass);
      this._localizerIsSetup = true;
    }
    const fullKey = key.startsWith("card.") ? key : "card.generic." + key;
    const result = this._localizer(fullKey);
    if ((result === fullKey || result === key) && fallBack) {
      return fallBack;
    }
    return result;
  };

  protected _formatValue(value: number): string {
    const numFractionDigits = this.unit === "kWh" ? 1 : 0;
    return (
      formatNumber(value, this.hass.locale, {
        maximumFractionDigits: numFractionDigits,
      }) +
      "\u00A0" +
      this.unit
    );
  }

  protected _onNodeClick(entityId?: string) {
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  static get styles(): CSSResultArray {
    return [
      super.styles as CSSResultGroup,
      css`
        .source-node[data-node-id]:not([data-node-id=""]),
        .consumer-node[data-node-id]:not([data-node-id=""]) {
          cursor: pointer;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-elec-radial": HaElecRadial;
  }
}
