// OpenNext picks this up automatically. Untyped to avoid pulling
// `open-next` as a project dependency just for the type import.
// OpenNext 3.9 emits `npm install --os=linux --arch=x64` for the
// install step. Modern npm has deprecated `--arch` in favour of
// `--cpu`, so the platform-targeted optional deps for Sharp aren't
// resolved and the bundle ships with no native binary. We pass the
// correct flag through `additionalArgs` and add `libc: "glibc"` so
// Sharp's libvips package's platform check is satisfied.
const config = {
  default: {
    install: {
      packages: ["sharp@0.34.5"],
      libc: "glibc",
      additionalArgs: "--cpu=x64",
    },
  },
};

export default config;
