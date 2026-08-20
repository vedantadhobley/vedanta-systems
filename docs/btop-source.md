# btop source and public-display profile

This document owns source reconciliation, the public-display profile, and the
known AMD APU limitation. Runtime transport and deployment live in
[btop integration](./btop.md).

## Source authority

`~/workspace/btop/src` is the intended authoritative modified btop checkout.
At the 2026-08-20 audit, its `main` worktree was dirty and behind upstream.
The reconciled `feature/vedanta-profiles` branch existed only in a temporary
checkout. Move that branch into a durable clean checkout before building the
new exporter image or documenting the path as a recoverable source of truth.

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
power. Both GPU and non-GPU builds of reconciled commit `6f76ec6` passed with
GCC 14. Reverify from the durable checkout before packaging.

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

1. move `feature/vedanta-profiles` into the durable btop checkout;
2. make the checkout clean and record its upstream/rebase state;
3. rebuild both GPU and non-GPU variants;
4. verify the operator default and public-display profile;
5. update btop-owned recovery documentation;
6. point exporter packaging at that checkout;
7. remove the stale embedded child only after the legacy deployment is retired.
