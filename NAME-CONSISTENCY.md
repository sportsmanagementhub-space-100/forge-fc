# Name and branding consistency audit

## Single source of truth
- Club name: `data.json` → `club.name`.
- Player names: `data.json` → `players[].name`.
- UI components should render these fields instead of keeping separate copies.

## Club name locations
Public header, hero title, footer and copyright use the canonical club name. The admin header refreshes from `state.club.name` when the state is hydrated and after Club settings are saved. Changes remain drafts until published successfully.

## Player name locations
Admin roster, player editor, public player cards, player profile modal and image alt text use the player object's `name`. Saving a draft updates admin views; publishing and refreshing updates public views.

## Limitations
Text inside image files, uploaded image filenames, or manually written biographies/mottos cannot be renamed automatically. Those must be edited separately. Browser caching or failed publishing can temporarily show old content.

## Manual verification
1. Change club name temporarily; save and check the admin header.
2. Publish and refresh the public site; check header, hero, footer and copyright.
3. Rename a test player; save and check the admin roster.
4. Publish and refresh; check the player card and profile modal.
5. Restore the intended production names after testing.
