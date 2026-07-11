# cec-mote

<img width="2048" height="1152" alt="download" src="https://github.com/user-attachments/assets/4d79921d-6886-436a-afc7-0772105d844d" />

`cec-mote` is a Decky Loader plugin for SteamOS that:

- sends HDMI-CEC volume commands through the built-in `cecd` D-Bus service
- assists with installing, repairing, verifying, and uninstalling services to put the TV in standby when the PC sleeps or shuts down, and to turn it on / change input when the PC resumes or starts. It is designed for active DP-to-HDMI adaptors such as the UGREEN 8K DP-to-HDMI adaptor, and also discovers Bluetooth dongles and enables them as wake targets.

The plugin does not talk to the CEC adapter directly. It uses `cecd` as the sole controller and sends only the validated high-level D-Bus methods exposed by `com.steampowered.CecDaemon1.CecDevice1`.
