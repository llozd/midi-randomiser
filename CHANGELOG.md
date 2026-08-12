# Changelog

All notable changes to this project are documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-12

### Added

- Light and dark mode setting.

### Changed

- Enable/disable all button positioning.

## [1.0.0] - 2026-08-11

### Added

- Initial sync with the MIDI Guide dataset, which now supplies every device.
- A manufacturer and model picker, and a button to enable or disable every
  parameter at once.
- 14-bit CC parameters, sent as a coarse and a fine control change.

### Changed

- Parameter changes are remembered per device rather than saved as whole
  devices.
- A parameter's name, type and number are shown as text, not form controls.

### Removed

- Creating, saving, importing, exporting and deleting devices. Missing or wrong
  devices are fixed in the dataset instead.

## [0.1.0] - 2026-08-03

### Added

- MIDI output over the Web MIDI API, with output port and channel selection.
- Randomise, sending one fresh random value to every enabled parameter as either
  a CC message or a 14-bit NRPN sequence.
- Devices as JSON files describing an instrument's parameters, validated against
  `devices/schema.json`. Korg Volca FM ships with the app.
- A parameter list showing each parameter's type, number, range and whether it is
  included in the randomisation, all editable in place.
- A device editor: create devices, save them to the browser's local storage,
  import and export them as JSON, and delete saved devices.
- A dark interface sized for desktop browsers.

[Unreleased]: https://github.com/llozd/midi-randomiser/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/llozd/midi-randomiser/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/llozd/midi-randomiser/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/llozd/midi-randomiser/releases/tag/v0.1.0
