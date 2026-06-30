# mote

`mote` is a minimal Decky Loader plugin that sends HDMI-CEC volume commands through the SteamOS `cecd` D-Bus service. It provides three controller-friendly actions in a Decky panel:

- `Volume Up`
- `Volume Down`
- `Mute`

The plugin does not talk to the CEC adapter directly. It uses `cecd` as the sole controller and sends only the validated high-level D-Bus methods exposed by `com.steampowered.CecDaemon1.CecDevice1`.

## Prerequisites

- Decky Loader
- SteamOS `cecd`
- A functioning HDMI-CEC adapter on the system
- HDMI-CEC enabled on the connected TV, AVR, or soundbar

The plugin does not install or configure CEC hardware and does not replace `cecd`.

## Supported controls

- `Volume Up`
- `Volume Down`
- `Mute`

The plugin reads the current `AudioLogicalAddress` from `cecd` before each action. A TV usually appears as logical address `0`. An AVR or soundbar may appear as logical address `5`.

CEC behavior varies by manufacturer, so compatibility depends on the connected display or audio device.

## Build requirements

This plugin inherits the current official Decky plugin template toolchain:

- Node.js compatible with the template
- `pnpm`

## Local build

```bash
pnpm install
pnpm run build
```

## Local Decky development and install

1. Build the plugin locally with the commands above.
2. Copy or symlink the repository into your Decky plugins directory on the target SteamOS system.
3. Reload Decky Loader or restart the plugin from the Decky developer flow.
4. Open the `mote` panel in Decky and confirm the status line identifies a reachable CEC device.

## Inspecting the installed CEC interface

```bash
busctl --user introspect \
  com.steampowered.CecDaemon1 \
  /com/steampowered/CecDaemon1/Devices/Cec0 \
  com.steampowered.CecDaemon1.CecDevice1
```

## Troubleshooting

Check recent `cecd` logs:

```bash
journalctl --user -u cecd.service -b --no-pager -n 100
```

If `mote` reports that no CEC device is ready, verify:

- `cecd` is running in the user session
- the HDMI-CEC adapter is detected by SteamOS
- HDMI-CEC is enabled on the TV, AVR, or soundbar

## Scope

`mote` does not:

- install `cecd`
- configure `/etc`
- create udev rules or systemd units
- replace `cecd`
- depend on `steamos-cec-bt-wake`
