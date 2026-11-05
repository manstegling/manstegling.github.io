## Game design analysis

Date: 2026-11-04
Version: 633970 (commit hash)
Seed: 73
Energy created: 1305
Completed lives (incl. gathered in the light): 112
Platform: Mobile (iOS)

### Gameplay and balance

#### Good pacing
* Current slow ramping up of seed deployment rate feels like a good rhythm (results 1000-1300 created energy, 80+110 people born)

#### Sinks seem at the right power
* Hoovers up any nearby created energy and prevents deploying seeds in the vicinity; just the right amount of devastating if not mitigated

#### Sinks don’t have lasting consequences
* Because people live such long lives, the inability to deploy new seeds while sinks are active does not cause the population to dwindle
* Might need to rebalance for much shorter lifespans, yet keep pacing and deployment rates somewhat intact

#### Sinks are too easily mitigated
* The player gets 4-6 sanctuaries which means they can counter any sinks threatening their populations
* By doubling the number of sinks (and halving their lifespan accordingly), the player can only mitigate half of them and will have to make difficult choices
* Might require to decrease the size of sanctuaries as well
* Should probably be implemented after world selection has been added and we’re starting to curate a set of interesting worlds

### UI and appearance

#### Cluttered, needs cleanup
* Only keep the gameplay pane, and put key numbers and action buttons inside it
* Remove most of the text everywhere

#### Improve secondary action for mobile
* Difficult to reach button; implement radial for long-press/3D press instead? (North: place device, south: cancel)

#### Needs visual cue that planting is closing/closed
* Frustrating right now that it suddenly doesn’t let you keep planting seeds when you’re rolling
* Still, the final breath of air and gathering animation is nice. So maybe a countdown using the same visual as the final boss warning. I.e. announcing “3”, followed by “2”, followed by “1”, followed by “Thank you for guiding us through the disturbance"
* Then, something to indicate that something has changed. Do not make the whole game gray, but something obvious should change, conveying that the player can no longer plant seeds

#### Performance cleanup, remove stutter
* Drains battery / uses an awful lot of CPU
* Stutters when boss fight appears, and even when individual sinks appear

#### UI aesthetics is too obviously AI-generated
* Need to restyle and add personal touch to the graphics and UI to make it feel unique

### Ideas for future game improvements and extensions

#### Implement world selection screen
* Instead of randomising worlds, pick 8 worlds with specific starting parameters showing off different play styles and increasing difficulty. E.g.
** Increasing number of sinks for each world
** Some world has only a very small starting cloud
** Some world has people only live half their normal lifespan
* Implement achievements for each world, e.g.
** Create over 1200 energy
** Have more than 100 people born
** Avoid creating a large community (possible energy should never go below 0.2/s)

### Replace current sanctuary design with accumulator
* The player may place 1 or more accumulators, devices that pull energy like a seed but only absorbs 2/s
* Energy absorbed by accumulators can be spent either on creating sanctuaries (energy spent locked up forever in the sanctuary), or on pre-souled embryos (needed for starting new populations)
* Creates a strategic choice whether to create additional populations to achieve better possible energy growth, or protect existing populations from sinks
* Needs proper balancing, and some narrative to support why more energy is needed for pre-souled embryos (and where that energy goes, because we cannot simply have everything go back to the cloud for balancing reasons)