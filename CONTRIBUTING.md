# Contributing

## Adding or fixing a device

Devices are not maintained here. They come from the
[MIDI Guide dataset](https://github.com/pencilresearch/midi) by Pencil
Research, which documents the MIDI implementation of several hundred
instruments and is rebuilt into this app on every deploy.

So if a device is missing, or a CC number is wrong, send it there. Their
[contributing guide](https://github.com/pencilresearch/midi/blob/main/CONTRIBUTING.md)
explains how.

Once it is merged there it appears here on the next sync, usually within a day.
Nothing needs doing in this repo.

## Bugs and features

Anything to do with the app itself is welcome here. Open an issue, or fork the
repo and send a pull request.

Note the split: how the app behaves is this repo's problem, but a device's
parameters are the dataset's, as above.

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
