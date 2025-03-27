# PhysX Pickup & Inspection Mode with Mobile Support

[link to site](https://tezeroth.github.io/neostratum/)

A web-based 3D environment with physics-based object interaction, supporting both desktop and mobile devices. Built with A-Frame and PhysX.

## Features

### Core Functionality
- Physics-based object interaction
- Object pickup and drop mechanics
- Inspection mode for detailed object examination
- Mobile-friendly controls
- Cross-device compatibility

### Desktop Controls
- **Mouse/Touchpad**:
  - Left-click to pick up/drop objects
  - Spacebar to toggle inspection mode
  - Mouse movement to rotate objects in inspection mode
  - WASD keys for movement
  - Mouse look for camera control

### Mobile Controls
- **Touch Interface**:
  - Tap to pick up/drop objects
  - Double-tap to drop objects
  - Two-finger tap to toggle inspection mode
  - Swipe to look around
  - On-screen arrow buttons for movement
  - Dedicated pickup/drop and examine buttons

### Look Mode Options
- **Swipe Mode**: Default mode for looking around using swipe gestures
- **Gyro Mode**: Device orientation-based camera control (requires permission)

## Components

### Desktop and Mobile Controls (`desktop-and-mobile-controls`)
Handles all user interactions across devices.

#### Properties
- `heldObject`: Currently held object (null if none)
- `inspectionMode`: Boolean indicating if in inspection mode
- `prevMouseX/Y`: Previous mouse/touch coordinates
- `lastTapTime`: Timestamp for double-tap detection

### Arrow Controls (`arrow-controls`)
Provides directional movement controls for mobile devices.

#### Properties
- `moveState`: Object tracking movement directions
  ```javascript
  {
    up: boolean,
    down: boolean,
    left: boolean,
    right: boolean
  }
  ```

### Scene Loading Check (`scene-loading-check`)
Manages scene visibility during loading.

### Fixed Floor (`fixed-floor`)
Maintains floor position and rotation.

## Known Issues and Limitations

### PhysX Component Warnings
The following properties are currently showing as unknown in the PhysX component:
- `shape`
- `restitution`
- `friction`
- `width`
- `height`
- `depth`

These warnings do not affect core functionality but indicate potential compatibility issues with the current PhysX version.

### Mobile-Specific Limitations
- Gyro mode requires device orientation permission
- Some devices may have limited gyroscope support
- Touch controls may vary based on device capabilities

## Technical Details

### Dependencies
- A-Frame v1.7.0
- PhysX v0.1.3
- Three.js (bundled with A-Frame)

### Physics Configuration
```javascript
{
  maxSubSteps: 4,
  fixedTimeStep: 1/60,
  gravity: {x: 0, y: -9.81, z: 0}
}
```

### Object Physics States
1. **Dynamic**: Default state for objects
2. **Kinematic**: Applied when objects are held
3. **Static**: Used for immovable objects (e.g., floor)

## Usage Examples

### Picking Up Objects
```html
<a-box 
  class="pickupable" 
  position="0 1.5 -3" 
  width="1" 
  height="1" 
  depth="1" 
  color="orange" 
  physx-body="type: dynamic; mass: 1;">
</a-box>
```

### Creating Static Objects
```html
<a-box 
  id="ground-plane"
  position="0 0 0" 
  width="30" 
  height="1" 
  depth="30"
  fixed-floor
  physx-body="type: static; mass: 0;">
</a-box>
```

## Development Notes

### Adding New Objects
1. **Basic Object Setup**
   ```html
   <a-box 
     class="pickupable" 
     position="0 1.5 -3" 
     width="1" 
     height="1" 
     depth="1" 
     color="orange" 
     physx-body="type: dynamic; mass: 1;">
   </a-box>
   ```
   - Add the `pickupable` class to make objects interactive
   - Position objects above the floor plane (y > 0)
   - Include `physx-body` component with appropriate type
   - Set initial position using x, y, z coordinates

2. **Physics Properties**
   - `type`: Choose from:
     - `dynamic`: For movable objects (default)
     - `static`: For immovable objects (e.g., floor)
     - `kinematic`: Applied automatically when objects are held
   - `mass`: Object weight (1 is standard)
   - Note: Some physics properties may show warnings but still function

3. **Custom Models**
   ```html
   <a-entity 
     gltf-model="#your-model" 
     position="0 1.5 -3" 
     scale="1 1 1"
     rotation="0 0 0" 
     class="pickupable" 
     physx-body="type: dynamic; mass: 1;">
   </a-entity>
   ```
   - Use `gltf-model` for custom 3D models
   - Adjust `scale` to match scene proportions
   - Set initial `rotation` as needed
   - Add to assets section:
     ```html
     <a-asset-item id="your-model" src="path/to/model.glb"></a-asset-item>
     ```

### Customizing Controls

1. **Desktop Controls**
   ```javascript
   // In desktop-and-mobile-controls component
   init: function () {
     // Modify key bindings
     this.onKeyPress = function (evt) {
       if (evt.code === 'Space') {
         // Change spacebar to different key
       }
     }
   }
   ```
   - Modify key bindings in `onKeyPress`
   - Adjust mouse sensitivity in `onMouseMove`
   - Change pickup/drop behavior in `onClick`

2. **Mobile Controls**
   ```javascript
   // In arrow-controls component
   init: function() {
     // Customize button layout
     const buttons = {
       up: '↑',
       left: '←',
       right: '→',
       down: '↓'
     }
   }
   ```
   - Modify button layout in `arrow-controls`
   - Adjust touch sensitivity in `onTouchMove`
   - Customize button appearance in CSS

3. **Look Mode Settings**
   ```javascript
   // In LookModeManager
   setMode(mode) {
     this.currentMode = mode;
     localStorage.setItem('lookMode', mode);
     // Add custom mode behavior
   }
   ```
   - Add new look modes
   - Modify gyro sensitivity
   - Change swipe behavior

### Performance Optimization

1. **Object Management**
   - Limit number of physics-enabled objects (recommended: < 50)
   - Use appropriate physics properties:
     ```javascript
     // Efficient physics settings
     physx-body="type: dynamic; mass: 1; linearDamping: 0.5; angularDamping: 0.5"
     ```
   - Remove unused objects:
     ```javascript
     el.parentNode.removeChild(el);
     ```

2. **Mobile Optimization**
   - Test on various devices
   - Adjust controls for different screen sizes
   - Consider device capabilities:
     ```javascript
     if (DeviceManager.isMobile) {
       // Mobile-specific optimizations
     }
     ```

3. **Scene Loading**
   - Use `scene-loading-check` component
   - Implement progressive loading
   - Show loading indicators

### Debugging Tips

1. **Common Issues**
   - Objects not picking up:
     - Check `pickupable` class
     - Verify physics properties
     - Ensure object is above floor
   - Physics warnings:
     - These are normal with current PhysX version
     - Functionality remains intact
   - Mobile controls not working:
     - Check device orientation permissions
     - Verify touch event handling
     - Test on different devices

2. **Console Commands**
   ```javascript
   // Access components
   const controls = document.querySelector('a-scene').components['desktop-and-mobile-controls'];
   
   // Debug physics
   console.log(controls.heldObject);
   console.log(controls.inspectionMode);
   
   // Force drop object
   controls.dropObject();
   ```

3. **Testing Checklist**
   - [ ] Desktop controls work
   - [ ] Mobile controls responsive
   - [ ] Physics behavior correct
   - [ ] Performance acceptable
   - [ ] Cross-browser compatible

### Best Practices

1. **Code Organization**
   - Keep components modular
   - Use clear naming conventions
   - Document custom modifications
   - Version control your changes

2. **User Experience**
   - Provide clear visual feedback
   - Implement smooth transitions
   - Handle edge cases gracefully
   - Test on multiple devices

3. **Maintenance**
   - Regular testing
   - Performance monitoring
   - User feedback collection
   - Documentation updates

## Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Mobile browsers with WebGL support

## Contributing
Feel free to submit issues and enhancement requests!

NTS: remember  Neostratum = Antique moored number ( the desktop and mobile script )
          Veridion = Boilerplate ( the vr script )
