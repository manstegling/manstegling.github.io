# Energy Rush

A small, responsive, single-button arcade game. **No frameworks, dependencies, backend, build tools, or accounts required.** Plays on phones, tablets, Macs, and PCs.

## Run locally

ES modules need a local server (opening `index.html` via `file://` may not work). From this directory:

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000** in your browser.

## How to play

- **Hold Space, left mouse button, or the large on-screen button** to work. Earn dollars while energy drains. Release to rest and regain energy.
- **Work continuously through the whole red mandatory-shift period** (a 0.24-second input grace exists). If you fail, or if your energy reaches zero at any time, the run ends.
- **Blue NIGHT** periods make resting 2.35× faster. Yellow **PAYDAY** periods double earnings. Orange **OVERHEAT** periods increase energy drain. Muted purple **QUIET** periods discourage work and reward rest. Green **FLOW** periods generate extra focus when working.
- **Diamonds** are collectible powerups. Work when their icon passes the NOW marker to pick one up. You can hold only one at a time.
- **Focus:** +1 for each $100 earned (before upkeep), +1 per uninterrupted five seconds of work. Spend focus on your stored powerup with **E** or the small on-screen button.
- **Tempo** increases whenever your net score first crosses a multiple of $1,000; upcoming events accelerate, and working pays more. The real-time game clock never exceeds five minutes.
- **P / Escape** pauses; changing tabs automatically pauses. Each level has three challenges and a local best score. Collected stars are saved in browser storage.
- After a run, **New random run** gives a fresh layout, while **Replay this layout** repeats the exact same random seed for practice.

## Level and balance configuration

`engine.js` contains all level parameters, challenge definitions, powerup costs, and the simulation. `main.js` implements UI, input, sound, and local high scores. `styles.css` defines the responsive look.

The timeline shows **10 real seconds** of the upcoming schedule. Events are generated in advance from a seed, with bounded randomness; hazards are kept away from mandatory shifts and pickups are moved out of sleep periods. This ensures a meaningful preview and prevents impossible combinations, while leaving each run distinctive.

## License

Copyright (c) 2026 Måns Tegling

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
