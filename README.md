# Home Assistant Energy Radial Cards

[![GitHub Release][releases-shield]][releases]
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)
[![License][license-shield]](LICENSE.md)

Energy Radial is a collection of dashboard cards for Home Assistant, displaying the flow of electrical energy and power in a beautiful radial hub-spoke layout.

The cards show your energy sources (solar, grid, battery) on the left, your home consumption in the center, and individual consumers on the right. Connection lines animate at different speeds based on power flow, and consumer circles scale proportionally to their usage.

The cards are ideal if you want to track your electricity consumption and identify where your energy is going.

There are two cards:

- **Radial Energy Flow Card** - shows the total _energy_ flow based on a configurable time range (e.g. day so far).
- **Radial Power Flow Card** - a user configurable card showing the _power_ flow for a set of sensors. This represents the live power flow at the current moment.

Both cards base their configuration on the existing Home Assistant energy configuration, and use the same colour scheme.

Both are live and automatically updating. The cards try to display a coherent representation even if the data set is incomplete or physically impossible. This means it is ok for asynchronous updates to be made to any of the entities the card is monitoring.

## Features

- Radial hub-spoke layout with animated dashed connection lines
- Line animation speed proportional to power flow
- Consumer circle sizes scale with power usage
- Consumers wrap into a grid layout when there are many
- Glow effects per source type (solar, grid, battery)
- Click on any node to open the entity's more-info dialog
- Custom names for consumer entities via the card editor
- Source percentage breakdown shown below the home hub
- Legend with source contributions

## Installation (the easy way)

If you've already installed HACS (https://hacs.xyz/), click this button and then click download!

[![Open your Home Assistant instance and open the energy-sankey-sh repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=SvenHamers&repository=energy-sankey-sh&category=dashboard)

## Installation via HACS

- Install HACS in your Home Assistant installation (see https://hacs.xyz/ for detailed instructions)
- Navigate to HACS within your Home Assistant instance (Menu > HACS)
- Add this repository as a custom repository: `https://github.com/SvenHamers/energy-sankey-sh`
- Click on **Energy Radial Card**
- Click Download
- Reload when prompted
- Select a dashboard and enter editing mode
- Type 'Radial' in the search box
- Select 'Radial Energy Flow Card' or 'Radial Power Flow Card'
  - The energy card does not require configuration
  - The power card auto configures. If there are any problems with autoconfiguration, use the built in card editor to select the correct power entities for grid input / generation / consumers / batteries.

## Language Translations

If you would like to see this card translated into your own language, your contribution is most welcome!

It's not too difficult to do; it can be done via a web browser.

In short the process is:

- Open the most recent [primary language file](https://github.com/SvenHamers/energy-sankey-sh/blob/main/src/translations/en.json) `en.json`.
- Copy the contents to the clipboard
- Navigate to the `translations/` parent directory by clicking 'translations'.
- Click 'Add file' to create a new file e.g. `de.json`
- Paste in the contents
- Translate to the new language
- Save the file in a new branch
- Create a pull request for this branch
- (To do the complete job...) Within the branch, edit `src/localize.ts` and uncomment the new language.

[license-shield]: https://img.shields.io/github/license/SvenHamers/energy-sankey-sh.svg?style=for-the-badge
[releases-shield]: https://img.shields.io/github/release/SvenHamers/energy-sankey-sh?style=for-the-badge
[releases]: https://github.com/SvenHamers/energy-sankey-sh/releases
