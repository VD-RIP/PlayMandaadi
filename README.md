# Mandaadi: The Game ⛵🌊

> An authentic 3D coastal sailboat racing game set on the Ramanathapuram coast of Tamil Nadu, celebrating the centuries-old cultural tradition of the annual *paaimaram* regatta.

Created and Developed by **Vishva Dev**.

---

## 🎮 Play & Experience

Experience the thrill of traditional Tamil wooden sailboat racing directly in your browser. Read the sea, hoist the sail (*paai*), manage your 6-man crew, navigate unpredictable wind shifts and coastal eddies, and race against rival village boats to take home the prize in the **Pandhayam**!

---

## ✨ Features

### 🌊 Realistic Sea & Aerodynamics Simulation
- **Custom GLSL Water Shaders**: Deep sea, shallow reef waters, foam crests, and dynamic gust/lull wave fields.
- **True Paaimaram Rigging Physics**: Dynamic sail hoist (*ஏத்து!*), sheet trim (*இழு!*), tacking and jibing (*பக்கம் மாத்து!*), and hiking out on the windward outrigger (*தொங்கன்!*).
- **Coastal Wind Dynamics**:
  - Near the shore: Straight sea breeze
  - Mid-course: Swirling crosswinds
  - Near the mark: Unpredictable land breezes, squalls, and treacherous whirlpool eddies

### 👥 6-Man Skeletal Crew Director
- Modeled after traditional Ramanathapuram boat crews with authentic cultural attire (*kannimar, thandai, rudder steersman, hike-out crew*).
- Real-time skeletal animations matching sail trim, heel counterbalance, and tack maneuvers.
- Dynamic crew stamina and effort management.

### 🏛️ Ramanathapuram Temple Shoreline & Village
- Rich 3D coastal village featuring a traditional *gopuram*, *mandapam*, *vimana*, coconut groves, temple flags, and a cheering crowd on the beach.
- Instanced geometry optimization for high, stutter-free 60 FPS performance.

### 🏆 Complete Game Modes
1. **Training Mode (7 Progressive Lessons)**:
   - *01. Steer* — Rudder handling and turning momentum
   - *02. Wind* — Reading wind direction and points of sail
   - *03. Paai* — Trimming and easing the main sail
   - *04. Sides* — Tacking around the mast
   - *05. Hike* — Hiking out to prevent capsizing in heavy gusts
   - *06. Sea* — Navigating squalls and glassy lulls
   - *07. Race* — Rounding the mark and sprinting for the finish
2. **Practice Match**: Race against 5 rival coast village boats (*Nambuthalai, Mandapam, Pamban, Thondi, Dhanushkodi*) with tactical AI.
3. **The Grand Race (Pandhayam)**: The coastal championship with maximum wind intensity and roaring crowds.

### 📊 Broadcast HUD & Social Poster Generator
- Real-time race standings, distance to mark, speedometer in knots, and heel balance meter.
- Live mini-map radar showing boat tracks, buoy positions, and wind vectors.
- Bilingual crew calls in Tamil and English with audio voice cues and visual indicators.
- Built-in HTML5 canvas race poster generator with custom stats, WhatsApp sharing, and high-res image download.

### 📱 Responsive Desktop & Mobile Touch Controls
- Desktop keyboard controls with hotkeys for every sailing maneuver.
- Mobile/tablet touch mode with virtual steering arrows, sheet trim buttons, hike-out controls, and auto-orientation handling.

---

## 🕹️ Controls Guide

| Action | Desktop Key | Touch / Mobile |
| :--- | :--- | :--- |
| **Steer Left (Port)** | `A` or `←` | Left Arrow Button |
| **Steer Right (Starboard)** | `D` or `→` | Right Arrow Button |
| **Sheet In (Trim Paai)** | `W` or `↑` | Sheet In Button |
| **Sheet Out (Ease Paai)** | `S` or `↓` | Sheet Out Button |
| **Change Sides (Tack/Jibe)** | `E` | Side Button |
| **Hike Out (Balance Heel)** | `Q` (hold) | Hike Button |
| **Look Ahead (Sea Read)** | `Space` (hold) | Eye Button |
| **Course Map & Standings** | `Tab` (hold) | Map Pill |
| **Auto Crew Trim Toggle** | `T` | Trim Mode Button |
| **Pause Game** | `P` | Pause Button |
| **Menu / Back** | `Esc` | Menu Pill |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0.0 or higher)

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/vishvadev/PlayMandaadi.git
   cd PlayMandaadi
   ```

2. Verify all game assets are present:
   ```bash
   npm run verify
   ```

3. Launch the local web server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://127.0.0.1:3000/
   ```

---

## 📁 Repository Structure

```
├── audio/                      # Audio soundtrack & sound effects
│   ├── eagle.mp3               # Ambient sea eagle call
│   ├── menu_naval.mp3          # Main menu cinematic parai percussion
│   ├── race_base.mp3           # Cruising race soundtrack
│   ├── race_fast.mp3           # High-speed planing theme
│   ├── race_final.mp3          # Climax race theme
│   ├── sea_bed.mp3             # Ocean soundscape
│   └── start_burst.mp3         # Race start horn & crowd burst
├── film/                       # Opening cinematic video
│   └── opening.mp4
├── icons/                      # PWA icons & web manifests
├── lib/                        # Three.js 3D library & geometry utilities
│   ├── BufferGeometryUtils.js
│   ├── GLTFLoader.js
│   ├── SkeletonUtils.js
│   └── three.min.js
├── shore/                      # 3D coastal village & temple geometry
│   ├── complex_model.js
│   ├── crowd_bodies.js
│   ├── gopuram_model.js
│   ├── mandapam_model.js
│   ├── palm_model.js
│   ├── shore.js
│   ├── veg_model.js
│   ├── village_layout.js
│   ├── village_model.js
│   └── vimana_model.js
├── boat_model.js               # 3D Paaimaram boat mesh & textures
├── crew.js                     # Crew behaviors, commands, and physics
├── crew_models.js              # 3D Skeletal crew models & anim clips
├── index.html                  # Main game client and application UI
├── livery.js                   # Traditional village boat colors & sail liveries
├── manifest.webmanifest        # Progressive Web App manifest
├── og.jpg                      # Social preview image
├── package.json                # Project dependencies and start scripts
├── rig.js                      # Sail rigging physics & sail shapes
├── sea.js                      # Procedural sea shaders & water physics
├── server.js                   # Static web server with audio/video streaming
└── verify_all.js               # Asset integrity verification suite
```

---

## 📜 License & Credits

- **Game Design & Development**: **Vishva Dev**
- **Inspiration**: Traditional Paaimaram sailboat racing of Ramanathapuram, Tamil Nadu & the film *Mandaadi*.
- **License**: [MIT License](LICENSE) — Feel free to use, modify, and distribute for personal and educational purposes.
