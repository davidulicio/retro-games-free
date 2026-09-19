# What may be hosted here

This site exists because there is a real, large collection of console games that
anyone may legally play and share. It stays on the right side of the line by
being strict about one question: **did the rights holder grant permission?**

## The short version

Host a game only if its author released it under a licence that permits
redistribution. If you cannot point at that licence, do not host the file.

## Why age is not a defence

Copyright on games from the 1980s and 1990s has not expired, and will not for
decades. Three beliefs that circulate widely are all wrong:

- *"It is abandonware."* Not a legal category. An unsold, unsupported game is
  still owned.
- *"I own the cartridge, so I can download the ROM."* Owning a copy does not
  license another copy. Whether making your own backup is permitted varies by
  country; obtaining someone else's copy is a separate act, and the usual answer
  is no.
- *"The publisher does not care."* Some do, some do not, and enforcement is
  their choice to make at any time.

Emulators themselves are a different matter: a clean-room emulator is lawful
software, which is why the player used here is perfectly fine. The game files
are the sensitive part.

## What is safe to host

**Homebrew with an explicit licence.** The large majority of what this site
ships. Authors publishing under MIT, zlib, Apache, GPL, MPL, BSD, the Unlicense,
CC0 or CC-BY have said in advance that redistribution is allowed. Most of these
still require that the notice and attribution travel with the file, which is why
`scripts/sync-library.mjs` writes a `LICENSE.txt` next to every ROM it stores,
and why the licence and author appear on each card.

**Work placed in the public domain.** Where the author has said so plainly.

**Games the rights holder has released for free distribution.** It happens; take
it in writing, and keep the page or message that says so.

## What is not

- Commercial titles for any console, whatever their age.
- Anything marked "freeware", "free" or "free to play" with nothing further.
  Free to play is not free to redistribute, and the distinction matters.
- Non-commercial licences (`CC-BY-NC`) if your site carries advertising,
  sponsorship or any other commercial element.
- No-derivatives licences (`CC-BY-ND`) where repackaging is arguably a
  derivative. The sync script excludes these by default; that is a cautious
  reading, and a deliberate one.
- Anything whose licence you are guessing at. "No licence stated" means all
  rights reserved. The database this site syncs from has roughly 1,300 entries
  with no stated licence, and none of them are hosted.
- ROM hacks and translation patches of commercial games. The new work may be
  original, but the base it modifies is not.

## Visitors' own files

The loader on the home page reads a file with the browser's File API and passes
it to the emulator inside the visitor's tab. Nothing is uploaded, stored or
logged, and your server never receives the file. You are not distributing
anything, which is precisely the point of building it this way.

Keep it that way. The moment you add an upload endpoint, a shared library or a
"recently played by others" feature backed by stored files, you are distributing
whatever people send, and you inherit responsibility for all of it.

## Requests to remove something

Add a contact route and honour requests quickly. Authors' wishes change, licence
labels in community databases are occasionally wrong, and a game catalogued as
MIT may have been mislabelled by someone other than its author. Deleting a
folder from `games/` and re-running the sync costs you nothing. Getting this
wrong costs more.

## Where the library comes from

The default library is drawn from the Game Boy and Game Boy Advance homebrew
databases maintained by the gbdev community, which catalogue entries and record
licences. The metadata is theirs; the licence filtering and the decision about
what to host are yours. Treat a database's licence field as a strong hint rather
than a legal opinion, and check anything you intend to feature prominently.

---

*This is a description of how the project is organised, written to be practical
rather than authoritative. It is not legal advice, and copyright rules differ by
country. If you are running this at any scale, or commercially, talk to someone
qualified in your jurisdiction.*
