# btop source and public-display profile

This document owns source reconciliation, the public-display profile, and the
known AMD APU limitation. Runtime transport and deployment live in
[btop integration](./btop.md).

## Source authority

The reconciled modified source now has a durable clean checkout at
`~/workspace/btop/vedanta-profiles`, on `feature/vedanta-profiles-september`.
On 2026-09-09, the temporary worktree moved there and the existing profile
patch was reapplied to upstream `3996a22`, producing `4aca040`.
The original dirty `~/workspace/btop/src` checkout and the prior
`feature/vedanta-profiles` commit `6f76ec6` remain preserved. Do not overwrite
them, reset them, or use that old dirty tree as the new image input.

Control's `feat/btop-telemetry` branch at `6d6543f` owns the first exporter/relay candidate
under `luv/telemetry/`, with an exact btop source lock and isolated acceptance
harness. The working checkout is `~/workspace/control/.worktrees/btop`.
This is not a live host rollout; public tiles still use the legacy image.

This repository's `btop/src` directory is the older child used by the live
legacy image. Do not add new source patches there. Remove it after exporter
packaging moves to the durable btop checkout.

## Reconciled profile

Current upstream btop already contains the robust ROCm 1.x ABI probe and AMD
APU sysfs fallback that the embedded child predates. The reconciled profile
branch adds only the remaining product requirements:

- `public_display_mode` for a compact, non-interactive embedded layout;
- `show_net_ip` as an independent privacy control;
- `gpu_mem_type = "vram" | "gtt"` across ROCm and sysfs collectors;
- `/hostfs` labeling as the monitored root.

Normal operator btop remains the default. The Strix Halo public profile uses:

```ini
public_display_mode = true
show_net_ip = false
gpu_mem_type = "gtt"
show_cpu_watts = false
```

`show_cpu_watts = false` avoids labeling whole-package APU power as CPU-only
power. Both GPU and non-GPU builds of `4aca040` passed with GCC 14 in the pinned
Ubuntu candidate image. Physical GPU/GTT accuracy and display parity remain
host-pilot gates; compilation is not hardware acceptance.

## Legacy embedded differences

The live embedded child carries older direct modifications:

- ROCm SMI 1.x acceptance for the Ubuntu ROCm package;
- GTT rather than the small VRAM carve-out for APU memory;
- optional network-IP hiding;
- lavender public-display labels and theme;
- removed box numbering and interactive CPU/network buttons.

These details explain the deployed legacy image. They are not the forward
patch plan; upstream behavior plus the configurable profile above replaces
them.

## Theme

The legacy `vedanta-lavender.theme` uses this palette:

| Role | Color |
|---|---|
| General text | `#7a5aaf` |
| Bright graph text | `#c9a0f0` |
| Titles | `#a57fd8` |
| Inactive graph background | `#3d2d5c` |
| Box outlines | `#5a4080` |

The btop tile remains a dense color-system case for the future component
language. Transport migration does not redesign the tile.

## Known Strix Halo utilization gap

Under Vulkan workloads, btop can show active clocks, memory, power, and
temperature while GPU busy percentage remains at 0%. ROCm SMI does not count
the relevant Vulkan queues, and the kernel `gpu_busy_percent` path is not
reliable for this workload on the audited Strix Halo stack.

This is not repairable through the current btop profile. Use
[`amdgpu_top`](https://github.com/Umio-Yasuno/amdgpu_top) for live GFX, compute,
decode, and encode engine utilization until the kernel/driver telemetry path
changes. Do not misrepresent a missing counter as a measured 0% load.

## Packaging gate

Before the exporter image changes source:

1. preserve the durable clean profile checkout and exact source lock (done);
2. record its upstream and patch revisions (done);
3. rebuild both GPU and non-GPU variants (done for `4aca040`);
4. verify the operator default and public-display profile;
5. update btop-owned recovery documentation;
6. accept Control's source-pinned exporter candidate after private host tests;
7. remove the stale embedded child only after the legacy deployment is retired.
