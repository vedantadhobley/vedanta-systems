# Adopted interaction principles

Status: adopted for the frontend re-foundation on 2026-09-08. These are
requirements for new and migrated components, not a claim that the current
site already passes every check.

Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
are a broad reference spanning foundations, patterns, components, and input
methods. We adopt selected principles, not Apple's complete native-platform
specification. The rules below are our web applications of that guidance.

The [re-foundation plan](./plans/frontend-refoundation.md) owns implementation
order; the [shell plan](./plans/frontend-shell.md) owns viewport and scroll
mechanics; the [design system](./design-system.md) owns visual material.
This document owns cross-component interaction acceptance. It does not
restart visual exploration or select fonts, icons, navigation, or dependencies.

## 1. Preserve context

Apple recommends familiar scroll behavior, avoiding same-axis nested scroll
views, and limiting automatic scrolling to what preserves context. Modal
experiences should have a clear purpose and an obvious exit.
Sources: [Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views),
[Modality](https://developer.apple.com/design/human-interface-guidelines/modality).

- Use the shell-selected scroll owner; preserve wheel, trackpad, touch,
  keyboard, and browser history behavior.
- Structural changes preserve the declared anchor through the shell's layout
  transaction. Retained space remains local and bounded, never an accumulating
  page-height workaround.
- A local clip overlay preserves disclosure and scroll position. Closing it
  restores focus to its invoker, or a sensible surviving control. Direct and
  restored share routes remain distinct entry paths to the same player.
- Modal focus stays inside the modal while background content is inert.
  Provide a visible close control and keyboard dismissal; a gesture is not
  the only exit.

## 2. Share meaning, adapt input

Apple treats pointing devices as an additional input, not a replacement for
touch. Sources:
[Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices),
[Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures).

- Specify touch, mouse, and keyboard behavior for every interactive component.
  Use the active input when behavior differs, not screen width or user agent.
- Hover may enhance discoverability; it cannot be the only way to find an
  action or essential information. Include visible focus and pressed states.
- Use semantic HTML, accessible names, and explicit disclosure state. Optical
  copies remain hidden from accessibility APIs and cannot capture input.
- Keep native media scrubbing and ordinary scrolling browser-owned. Touch
  movement must not become an accidental click or control-reveal gesture.

## 3. Keep dense visuals comfortable to operate

Apple's [design tips](https://developer.apple.com/design/tips/) recommend
44-by-44-point touch controls. Our default for important standalone touch
controls is a **44-by-44 CSS-pixel hit area**, independent of icon size.
This is a web sizing choice, not a conversion of native points.

- Expanded hit areas cannot overlap another action or obscure adjacent text.
- Document and test compact exceptions instead of silently shrinking targets.
  Inline links and native controls need context-appropriate treatment.
- Distinguish our target from the web standard:
  [WCAG 2.2 target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  is 24-by-24 CSS pixels at AA, with exceptions;
  [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)
  is 44-by-44 at AAA, also with exceptions. Target size alone is not an
  accessibility conformance claim.

## 4. Make hierarchy survive real content

Apple uses typography and material roles to distinguish information and
controls. Sources:
[Typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

- Define semantic text roles: headings, controls, metadata, and measurements.
  Font families remain replaceable; not every role must be monospaced.
- At narrow widths or larger text sizes, move secondary information before
  truncating primary content. Test long team names, timestamps, and labels.
- Maintain hierarchy, readable contrast, and meaningful labels with effects
  disabled. Color and glow cannot be the only state indicators.
- Apple's controls-over-content hierarchy is a useful analogy, not our plane
  classification. Our control geometry remains crisp; its label or icon may
  still belong to the rear data plane. Do not add Liquid Glass or move whole
  controls between planes merely to imitate Apple.

## 5. Respond immediately; make effects optional

Apple recommends brief, purposeful motion that people can interrupt.
Sources: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

- Input commits state immediately. Step transitions and afterglow cannot
  lock controls, delay a request, or let an old animation overwrite new intent.
- Current-site control feedback snaps: hover, press, release, focus, and
  selected/disabled states have no interpolated color or geometry transition.
  Shared primitives and project controls preserve their existing state colors.
  This project choice is not an Apple requirement. GitHub's contribution
  animation and independent loading/live-status signals are outside this rule;
  do not use a universal animation override. The paused phosphor workbench
  remains a separate design experiment.
  Verify with the [control feedback checks](../tests/control-feedback/README.md).
- Test rapid expand/collapse reversal, not just an uninterrupted demonstration.
- Reduced-motion and no-effect modes retain the settled content, state, and
  focus indication. Decorative flicker, spatial steps, and persistence stop.
- Share timing tokens where useful, but do not infer one universal duration
  from HIG. Permanent timing remains a component-design decision.

## 6. Show truthful state in stable locations

Apple distinguishes measurable progress from indeterminate work and asks for
useful feedback when work stalls. Source:
[Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators).

- Define loading, refreshing, empty, complete, stale, and failed states where
  applicable. Do not invent a percentage when progress is unknown.
- Found Footy searching and complete-with-no-clips are different states.
  Transport connection and data freshness are also different facts.
- Keep status feedback in a consistent location and preserve usable data
  during recovery. Offer a relevant recovery action for recoverable failures.
- Announce important state changes accessibly without announcing every clock
  tick or decorative frame.

## 7. Adapt to the actual web viewport

Native layout recommendations require web-specific implementation. Sources:
[Apple layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[WebKit safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

- The shell consumes actual safe-area insets once. No component guesses a
  Safari/Chrome toolbar height or adds its own duplicate bottom padding.
- Validate browser-tab and standalone modes separately, including keyboard,
  rotation, text enlargement, zoom, and wake/resume on a physical iPhone.
- HIG cannot fix viewport bugs or select our scroll architecture for us.
  The existing shell acceptance matrix remains the implementation gate.

## Component review gate

Each component must declare its applicable checks and record evidence before
adoption. Passing a visual review alone is insufficient.

| Component responsibility | Required evidence |
|---|---|
| Action or disclosure | Touch, mouse, keyboard, hit area, name/state, visible focus, and rapid repeated input |
| Dialog or media overlay | Entry/exit, background inertness, focus containment/restoration, unchanged underlying context, and native media gestures |
| Dynamic content region | Expansion, collapse, date/filter replacement, loading/error transitions, and late responses preserve the declared anchor |
| Text or status | Long content, enlarged text, clear hierarchy, honest empty/error/freshness states, and meaning without color or glow |
| Optical treatment | Readable core, immediate input, interruption, reduced motion, no effects, and no duplicate semantics |
| Shell | One scroll owner per profile, safe areas, browser/standalone differences, keyboard, rotation, and history restoration |

Record deliberate exceptions with their reason and test coverage. Changes to
Apple's guidance trigger review, not automatic changes to our component API.
