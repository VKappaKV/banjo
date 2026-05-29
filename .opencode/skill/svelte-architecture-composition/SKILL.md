---
name: svelte-architecture-composition
description: Architecture and composition standards for Svelte 5. Rules for breaking down monolithic components, utilizing local snippets, implementing compound component patterns, and managing shared state cleanly via context runes.
---

The primary goals are:

- Favor composition over configuration.
- Avoid monolithic components with excessive conditional rendering.
- Keep state management centralized and explicit.
- Reduce prop drilling and event bubbling.
- Improve template readability through structured decomposition.
- Enforce strict TypeScript typing and predictable reactivity patterns.

---

# Composition over Configuration

Never build a single "black-box" component that changes its entire visual layout based on multiple conditional flags or configuration props.

### Avoid

```svelte
<MessageComposer
    isEditing
    showFooter
    hideAttachmentButton
    compact
    inline
/>
```

This creates:

- Template branching explosion
- Unclear component responsibilities
- Difficult maintenance
- Poor scalability

### Preferred Approach

Break the UI into specialized atomic Compound Components or Local Snippets and let the parent explicitly compose the structure it requires.

```svelte
<Composer.Provider>
    <Composer.Header />
    <Composer.Input />

    <ThreadActions />

    <Composer.Footer>
        <Composer.EmojiAction />
        <Composer.SubmitButton />
    </Composer.Footer>
</Composer.Provider>
```

The parent owns layout composition.

Children own behavior.

---

# Snippets vs Separate Components

Use the following binary decision rule.

## Use Local Snippets (`{#snippet}`)

When:

- The template has become visually large.
- The extracted markup is only used once.
- No isolated lifecycle is needed.
- No independent state is required.

Purpose:

- Reduce cognitive load.
- Improve file navigation.
- Preserve locality.

### Example

```svelte
{#snippet ThreadHeader()}
    <header>
        ...
    </header>
{/snippet}
```

---

## Use Separate Components

When:

- State isolation is required.
- Lifecycle hooks are required.
- Internal event handling becomes complex.
- The UI is reused elsewhere.

Organize components by feature domain.

### Example Structure

```txt
src/lib/components/
└── composer/
    ├── Provider.svelte
    ├── Header.svelte
    ├── Input.svelte
    ├── Footer.svelte
    └── SubmitButton.svelte
```

---

# Shared State via Context Runes

Avoid:

- Deep prop drilling
- Multi-level event forwarding
- Cross-tree synchronization through props

Instead:

Encapsulate shared logic inside a context-bound state container.

---

# Context-Based State Container Pattern

## State Definition

```ts
// composer-context.ts

import { setContext, getContext } from "svelte";

export class ComposerState {
  text = $state("");
  isSubmitting = $state(false);

  async submit() {
    // network logic
  }
}

const COMPOSER_KEY = Symbol("composer-state");

export function setComposerState() {
  return setContext(COMPOSER_KEY, new ComposerState());
}

export function useComposerState() {
  return getContext<ComposerState>(COMPOSER_KEY);
}
```

---

## Provider Component

```svelte
<!-- composer/Provider.svelte -->

<script lang="ts">
    import { setComposerState } from '../composer-context';

    interface Props {
        children: Snippet;
    }

    let { children }: Props = $props();

    setComposerState();
</script>

{@render children()}
```

---

## Consumer Component

```svelte
<!-- composer/Input.svelte -->

<script lang="ts">
    import { useComposerState } from '../composer-context';

    const state = useComposerState();
</script>

<input bind:value={state.text} />
```

---

## Composition Example

```svelte
<!-- ChannelThreadView.svelte -->

<script lang="ts">
    import * as Composer from '$lib/components/composer';
</script>

<Composer.Provider>
    <div class="composer-frame">

        <Composer.Header />

        <Composer.Input />

        <div class="thread-bar">
            <input type="checkbox" id="sync" />
            <label for="sync">
                Also send to channel
            </label>
        </div>

        <Composer.Footer>
            <Composer.EmojiAction />
            <Composer.SubmitButton />
        </Composer.Footer>

    </div>
</Composer.Provider>
```

Benefits:

- Layout remains explicit.
- Components stay reusable.
- Shared state remains centralized.
- No prop chains.
- No event bubbling chains.

---

# Strict Directives

The following rules are mandatory when writing, editing, or refactoring Svelte 5 code.

---

# 1. Template Line Constraints

If markup inside any:

```svelte
{#if}
{:else}
{#each}
```

block exceeds **30 lines**, it must be extracted.

### Allowed Targets

- Local `{#snippet}`
- Dedicated child component

### Bad

```svelte
{#if isOpen}
    <!-- 60 lines of markup -->
{/if}
```

### Good

```svelte
{#if isOpen}
    {@render OpenPanel()}
{/if}

{#snippet OpenPanel()}
    ...
{/snippet}
```

or

```svelte
{#if isOpen}
    <OpenPanel />
{/if}
```

---

# 2. Derived State for UI Variations

Never execute style mapping logic directly inside templates.

Move visual derivations into `$derived`.

### Good

```svelte
<script lang="ts">
    interface Props {
        type: 'danger' | 'default';
    }

    let { type }: Props = $props();

    let themeClass = $derived(
        type === 'danger'
            ? 'bg-red text-white'
            : 'bg-gray text-black'
    );
</script>

<div class={themeClass}>
    ...
</div>
```

### Bad

```svelte
<div
    class={
        type === 'danger'
            ? 'bg-red text-white'
            : 'bg-gray text-black'
    }
>
    ...
</div>
```

### Rule

Any visual variant, theme mapper, state mapper, or conditional styling should be represented by a derived reactive primitive.

---

# 3. Explicit Prop Typing

Always define a strict TypeScript interface for incoming props.

### Good

```ts
interface Props {
  message: Message;
  editable: boolean;
}

let { message, editable }: Props = $props();
```

### Bad

```ts
let { message, editable } = $props();
```

or

```ts
let { message }: any = $props();
```

### Rule

Never use:

- `any`
- untyped `$props()`
- loose object shapes

All public component contracts must be explicit.

---

# 4. Context Encapsulation over Event Bubbling

If custom events must travel more than one parent level, stop and refactor.

### Bad

```txt
Button
  → Input
    → Form
      → Composer
```

with repeated:

```ts
dispatch("submit");
```

and forwarding.

### Preferred

Move the shared logic into a context-bound state class.

```ts
const state = useComposerState();

state.submit();
```

### Rule

If an interaction requires:

- multi-level event forwarding
- event payload transformation
- repeated re-dispatching

then replace the pattern with:

```ts
setContext();
getContext();
```

using a shared state container.

---

# Architectural Summary

## Prefer

- Compound Components
- Context-bound state containers
- Local snippets for one-off layout extraction
- Feature-based component organization
- Derived UI state
- Explicit TypeScript contracts

## Avoid

- Configuration-heavy components
- Prop drilling
- Multi-level event bubbling
- Massive template blocks
- Inline styling logic
- Untyped props
- Monolithic component architecture

These standards should be considered the default architecture for all Svelte 5 feature development and refactoring efforts.
