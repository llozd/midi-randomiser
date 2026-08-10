# Contributing

## Adding or fixing a device

Devices are not maintained here. They come from the
[MIDI Guide dataset](https://github.com/pencilresearch/midi) by Pencil
Research, which documents the MIDI implementation of several hundred
instruments and is rebuilt into this app on every deploy.

So if a device is missing, or a CC number is wrong, send it there:

1. Grab
   [`template.csv`](https://raw.githubusercontent.com/pencilresearch/midi/main/template.csv)
   from their repo and fill it in, or edit the existing file for your device.
2. Open a pull request against `pencilresearch/midi`, or email it to
   <midi@midi.guide> and they will publish it for you.

Once it is merged there it appears here on the next sync, usually within a day.
Nothing needs doing in this repo.

## Working on the app

```bash
npm install    # installs linters and sets up the pre-commit hook
npm run devices    # clones the dataset and generates devices/generated/
npm run lint       # eslint + stylelint + json format + html + device files
npm test           # node:test, no watch mode
```

`npm run devices` has to run at least once before the app has anything to load
and before `npm run lint` can validate it. It clones into `.midi-guide/` and
writes to `devices/generated/`, both of which are gitignored. Pass a path to
convert an existing clone instead:

```bash
node scripts/import-devices.mjs ../midi
```

Lint and tests run in CI on every pull request and must pass before merge.

## Releases

The version, changelog and GitHub release are updated automatically when the
dataset changes. Nothing to do here.
