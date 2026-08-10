# Accessibility Assignment Notes

This assignment had two parts: build the Disclosure, Tabs, and Modal patterns
from the W3C ARIA Authoring Practices Guide by hand
(`app/playground/disclosure`, `app/playground/tabs`, `app/playground/modal`),
then install shadcn/ui and compare the generated Dialog and Tabs
(`components/ui/dialog.tsx`, `components/ui/tabs.tsx`) against the handmade
versions. These are the concrete differences that comparison surfaced.

## 1. Focus trapping

Our `Modal` re-queries focusable descendants with a static CSS selector on
every `Tab` keypress and manually bounces focus between the first/last match
(`Modal.tsx:34-59`). It works correctly for the content we render, but the
selector is a hand-maintained allowlist and does not fully model the
browser's actual tabbability rules. For example, it can include elements
that are not actually reachable by sequential keyboard focus because of
their rendered state, and it does not cover cases such as shadow-DOM focus
targets.

Radix Dialog delegates this to its internal `FocusScope`, backed by the
`tabbable` library, which handles a broader set of focusability edge cases
than a hand-written selector reasonably can. None of that logic is visible in
`components/ui/dialog.tsx` — the wrapper passes no focus-related props to
`DialogPrimitive.Content` at all.

## 2. Focus restoration

Our `Modal` captures `document.activeElement` into a ref when it opens, and
restores it in the same effect's cleanup function (`Modal.tsx:21-30`), so
focus reliably returns to whatever triggered the dialog.

Radix handles this internally and exposes `onCloseAutoFocus` on
`Dialog.Content` as an extension point for overriding the default — a
customization hook our version doesn't offer without adding a new prop.

## 3. Background isolation and portals

Our `Modal` renders inline in the component tree with `position: fixed`
(`Modal.tsx:61-90`) and prevents keyboard escape only through the focus trap.
It does not portal to `document.body`, and it does not mark background
content `inert` or `aria-hidden` — a screen reader's virtual cursor can still
browse background content even though physical Tab presses can't reach it.

Radix Dialog portals its content via `DialogPortal` (`dialog.tsx:22-26,
59-60`) and provides background isolation (inert-style) and body scroll-lock
as defaults of modal-mode `Dialog.Root`.

## 4. Tabs keyboard behavior

Our `Tabs` handles `ArrowLeft`/`ArrowRight`/`Home`/`End`, wrap-around, and
roving `tabIndex` explicitly in a `switch` statement (`Tabs.tsx:26-45`). It's
horizontal-only, with no concept of orientation or text direction.

Radix delegates the same behavior to its shared `RovingFocusGroup`
primitive, which also supports `orientation` (horizontal/vertical) and RTL
as configuration rather than code — visible in our wrapper only as the
`orientation` prop being forwarded (`tabs.tsx:11,17`) with no implementation
behind it in this repo.

## 5. Dismissal behavior

Our `Modal` closes on Escape and via its own explicit controls
(`Modal.tsx:35-38`), but clicking the backdrop does nothing — there's no
`onClick` on the overlay.

Radix Dialog wraps its content in `DismissableLayer`, which supports
outside-pointer dismissal by default alongside Escape, and exposes
`onEscapeKeyDown`/`onPointerDownOutside` callbacks for customizing either.
This is a real behavior difference a user would notice, not just an
implementation detail.

## What I learned

shadcn/ui is not a component library in the traditional sense — running
`shadcn add dialog tabs` didn't hand us finished, self-contained components.
It generated thin wrapper files (`components/ui/dialog.tsx`,
`components/ui/tabs.tsx`) that are almost entirely Tailwind styling and
`data-slot` hooks around `@radix-ui` primitives. Searching both files turns
up no `useState`, `useEffect`, `onKeyDown`, or literal `role`/`aria-*`
attribute — every behavior above (the trap, restoration, portal, background
isolation, roving focus, dismissal) lives inside Radix's primitives, not in
the code shadcn generated into this repo.

That reframes what "installing shadcn/ui" actually bought us: not styled
markup, but Radix's accessibility engineering, with the generated files as a
customizable skin on top of it.

None of this means our handmade components are inaccessible or incorrect —
they satisfy every requirement of this exercise: correct roles, working
focus management, a real keyboard-only trap, and correct ARIA wiring,
confirmed by manual keyboard testing. The comparison shows where a mature,
widely-used primitive has broader edge-case coverage (focusability detection,
inert backgrounds, orientation/RTL, outside-click) and more configuration
surface (controlled/uncontrolled state, override callbacks) than a
purpose-built implementation written for three specific examples needs to
have.
