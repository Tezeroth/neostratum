// Register PhysX component
AFRAME.registerComponent('physx', {
  init: function() {
    this.el.sceneEl.systems.physx = this;
    this.initialized = false;
    this.initPhysX();
  },

  initPhysX: function() {
    const config = this.el.getAttribute('physx');
    if (!config) return;

    // Initialize PhysX with proper configuration
    this.el.sceneEl.setAttribute('physics-world-config', {
      maxSubSteps: 4,
      fixedTimeStep: 1/60,
      gravity: {x: 0, y: -9.81, z: 0},
      debug: false
    });

    this.initialized = true;
    this.el.sceneEl.emit('physx-ready');
  }
});

// Device Manager: Handles device detection, permissions, and capabilities
const DeviceManager = {
  isVR: false,
  isMobile: false,
  hasGyro: false,
  
  async init() {
    // VR check
    if (navigator.xr) {
      try {
        this.isVR = await navigator.xr.isSessionSupported('immersive-vr');
      } catch (e) {
        this.isVR = false;
      }
    }
    
    // Mobile check
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    
    // Gyro check
    this.hasGyro = window.DeviceOrientationEvent !== undefined;
    
    return true;
  },

  async requestGyroPermission() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        return permission === 'granted';
      } catch (error) {
        return false;
      }
    }
    return true;
  }
};

// Look Mode Manager: Handles switching between swipe and gyro modes
const LookModeManager = {
  currentMode: 'swipe',
  gyroEnabled: false,
  
  init() {
    this.currentMode = localStorage.getItem('lookMode') || 'swipe';
    this.createToggleButton();
    
    if (DeviceManager.hasGyro) {
      this.initGyro();
    }
  },

  createToggleButton() {
    const button = document.createElement('button');
    button.className = 'look-mode-btn';
    this.updateButtonText(button);
    
    button.addEventListener('click', async () => {
      if (this.currentMode === 'swipe') {
        if (await DeviceManager.requestGyroPermission()) {
          this.setMode('gyro');
        } else {
          this.showPermissionDenied();
        }
      } else {
        this.setMode('swipe');
      }
    });
    
    document.body.appendChild(button);
  },

  updateButtonText(button) {
    button.innerHTML = this.currentMode === 'swipe' ? '⇄' : '⟲';
    button.title = `${this.currentMode.toUpperCase()} MODE${DeviceManager.hasGyro ? ' (tap to switch)' : ''}`;
    button.disabled = !DeviceManager.hasGyro;
  },

  setMode(mode) {
    this.currentMode = mode;
    localStorage.setItem('lookMode', mode);
    this.updateButtonText(document.querySelector('.look-mode-btn'));
    
    if (mode === 'gyro') {
      this.enableGyro();
    } else {
      this.disableGyro();
    }
  },

  showPermissionDenied() {
    const overlay = document.createElement('div');
    overlay.className = 'permission-overlay';
    overlay.innerHTML = `
      <div class="permission-content">
        <h2>Gyroscope Permission Required</h2>
        <p>Please enable device orientation access to use gyroscope controls.</p>
        <button>OK</button>
      </div>
    `;
    
    overlay.querySelector('button').onclick = () => {
      overlay.remove();
    };
    
    document.body.appendChild(overlay);
  },

  initGyro() {
    window.addEventListener('deviceorientation', this.handleGyro.bind(this), false);
  },

  handleGyro(event) {
    if (!this.gyroEnabled || this.currentMode !== 'gyro') return;
    
    const camera = document.querySelector('#camera');
    if (!camera) return;

    const lookControls = camera.components['look-controls'];
    if (lookControls) {
      lookControls.pitchObject.rotation.x = THREE.MathUtils.degToRad(event.beta);
      lookControls.yawObject.rotation.y = THREE.MathUtils.degToRad(-event.gamma);
      lookControls.updateRotation();
    }
  },

  enableGyro() {
    this.gyroEnabled = true;
  },

  disableGyro() {
    this.gyroEnabled = false;
  }
};

// Main Control Component: Handles desktop and mobile interactions
AFRAME.registerComponent('desktop-and-mobile-controls', {
  init: function () {
    this.camera = document.querySelector('#camera');
    this.heldObject = null;
    this.inspectionMode = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;
    this.lastTapTime = 0;  // For double tap detection
    this.cursor = document.querySelector('#cursor');
    
    this.onClick = this.onClick.bind(this);
    this.onKeyPress = this.onKeyPress.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);

    window.addEventListener('click', this.onClick);
    window.addEventListener('touchend', this.onTouchEnd.bind(this));
    window.addEventListener('keydown', this.onKeyPress);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('touchmove', this.onTouchMove);
    window.addEventListener('touchstart', this.onTouchStart);

    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.isSwiping = false;
  },

  remove: function () {
    // Clean up all event listeners
    window.removeEventListener('click', this.onClick);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('keydown', this.onKeyPress);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchstart', this.onTouchStart);
    
    // Clean up any lingering tick listeners
    if (this._tickFunction) {
      this.el.sceneEl.removeEventListener('tick', this._tickFunction);
      this._tickFunction = null;
    }
    
    // Clear any active timeouts
    if (this._restoreTimeout) {
      clearTimeout(this._restoreTimeout);
      this._restoreTimeout = null;
    }
    
    if (this._dropTimeout) {
      clearTimeout(this._dropTimeout);
      this._dropTimeout = null;
    }
    
    // Restore any touched objects
    this.restoreTouchedObjects();
    
    // Drop any held object
    if (this.heldObject) {
      this.dropObject();
    }
  },

  onClick: function (evt) {
    if (DeviceManager.isMobile) {
      // On mobile, only allow button interactions
      return;
    }

    if (evt.target.classList.contains('arrow-btn') || evt.target.classList.contains('arrow-controls')) {
      return;
    }

    if (this.inspectionMode) return;

    const cursor = document.querySelector('#cursor');
    const intersection = cursor.components.raycaster.intersections[0];

    if (!intersection) return;

    const clickedEl = intersection.object.el;
    if (!clickedEl.classList.contains('pickupable')) return;

    if (this.heldObject) {
      this.dropObject();
    } else {
      this.pickupObject(clickedEl);
    }
  },

  pickupObject: function (el) {
    if (this.heldObject) return; // Prevent multiple pickups
    
    this.heldObject = el;
    const position = el.object3D.position.clone();
    const quaternion = el.object3D.quaternion.clone();
    
    // Store original physics state
    this._originalPhysicsState = el.getAttribute('physx-body');
    
    // Completely remove physics from picked up object initially
    el.removeAttribute('physx-body');
    
    // Store the object's current transform
    this._savedPosition = position;
    this._savedQuaternion = quaternion;
    
    // Set up physics application after 2 seconds
    this._physicsTimeout = setTimeout(() => {
      if (this.heldObject === el && !this.inspectionMode) {
        // Apply kinematic physics to allow movement while held
        el.setAttribute('physx-body', {
          type: 'kinematic',
          mass: 1,
          restitution: 0.3,
          friction: 0.5,
          linearDamping: 0.1,
          angularDamping: 0.1
        });
        
        // Ensure object maintains its current position
        el.object3D.updateMatrix();
      }
    }, 2000);
    
    // Create a new tick function each time to avoid memory leaks
    this._tickFunction = this.tick.bind(this);
    this.el.sceneEl.addEventListener('tick', this._tickFunction);
  },
  
  restoreTouchedObjects: function() {
    if (!this._touchedObjects) return;
    
    this._touchedObjects.forEach(objState => {
      if (!objState.restored && objState.el) {
        const obj = objState.el;
        
        // Don't restore if we're still holding something
        if (this.heldObject === obj) return;
        
        obj.removeAttribute('physx-body');
        
        requestAnimationFrame(() => {
          if (obj && objState.physicsState) {
            obj.setAttribute('physx-body', objState.physicsState);
            obj.object3D.position.copy(objState.position);
            obj.object3D.rotation.copy(objState.rotation);
            obj.object3D.updateMatrix();
            objState.restored = true;
          }
        });
      }
    });
    
    // Clear reference to avoid memory leaks
    this._touchedObjects = null;
  },

  dropObject: function () {
    if (!this.heldObject) return;

    // Clear the physics timeout if it exists
    if (this._physicsTimeout) {
      clearTimeout(this._physicsTimeout);
      this._physicsTimeout = null;
    }

    const el = this.heldObject;
    const position = el.object3D.position.clone();
    const quaternion = el.object3D.quaternion.clone();
    
    // Clear references first
    if (this._tickFunction) {
      this.el.sceneEl.removeEventListener('tick', this._tickFunction);
      this._tickFunction = null;
    }
    
    // Store reference to current held object and clear it
    const previousHeldObject = this.heldObject;
    this.heldObject = null;
    
    // Reapply original physics state
    if (previousHeldObject && this._originalPhysicsState) {
      previousHeldObject.removeAttribute('physx-body');
      requestAnimationFrame(() => {
        previousHeldObject.setAttribute('physx-body', this._originalPhysicsState);
        previousHeldObject.object3D.position.copy(position);
        previousHeldObject.object3D.quaternion.copy(quaternion);
        previousHeldObject.object3D.updateMatrix();
      });
    }
  },

  tick: function () {
    if (!this.heldObject || this.inspectionMode) return;

    const camera = this.camera;
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    const quaternion = new THREE.Quaternion();
    
    camera.object3D.getWorldPosition(position);
    camera.object3D.getWorldQuaternion(quaternion);
    direction.applyQuaternion(quaternion);
    
    const targetPosition = position.clone().add(direction.multiplyScalar(2));
    
    // Only update if position has actually changed
    if (!this.heldObject.object3D.position.equals(targetPosition)) {
      this.heldObject.object3D.position.copy(targetPosition);
      this.heldObject.object3D.quaternion.copy(quaternion);
      this.heldObject.object3D.rotateY(Math.PI);
      this.heldObject.object3D.updateMatrix();
    }
  },

  onKeyPress: function (evt) {
    if (evt.code === 'Space' && this.heldObject) {
      this.toggleInspectionMode();
    }
  },

  onTouchStart: function (evt) {
    if (evt.touches.length === 2 && this.heldObject) {
      this.toggleInspectionMode();
      return;
    }

    if (evt.target.classList.contains('arrow-btn') || evt.target.classList.contains('action-btn')) {
      return;
    }

    this.touchStartX = evt.touches[0].clientX;
    this.touchStartY = evt.touches[0].clientY;
    this.touchStartTime = Date.now();
    this.isSwiping = false;
    
    this.prevMouseX = evt.touches[0].clientX;
    this.prevMouseY = evt.touches[0].clientY;
  },

  onTouchMove: function (evt) {
    if (evt.touches.length !== 1) return;
    
    const touch = evt.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    
    // If movement is more than 10px, consider it a swipe
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      this.isSwiping = true;
    }

    if (this.isSwiping) {
      // Normalize sensitivity for both axes
      const sensitivity = 0.005;
      const moveDeltaX = (touch.clientX - this.prevMouseX) * sensitivity;
      const moveDeltaY = (touch.clientY - this.prevMouseY) * sensitivity;

      if (this.inspectionMode && this.heldObject) {
        // Inspection mode rotation logic remains unchanged
        const threshold = 0.001;
        const absX = Math.abs(moveDeltaX);
        const absY = Math.abs(moveDeltaY);

        const camera = document.querySelector('#camera');
        const cameraQuaternion = new THREE.Quaternion();
        camera.object3D.getWorldQuaternion(cameraQuaternion);

        if (absX > threshold && absX > absY * 2) {
            const yAxis = new THREE.Vector3(0, 1, 0);
            const rotation = new THREE.Quaternion().setFromAxisAngle(yAxis, -moveDeltaX);
            this.heldObject.object3D.quaternion.multiply(rotation);
        } else if (absY > threshold && absY > absX * 2) {
            const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
            const rotation = new THREE.Quaternion().setFromAxisAngle(xAxis, moveDeltaY);
            this.heldObject.object3D.quaternion.multiply(rotation);
        }
        this.heldObject.object3D.updateMatrix();
      } else {
        // Camera look controls with constrained vertical rotation
        const lookControls = this.camera.components['look-controls'];
        if (lookControls) {
          // Reversed the direction by removing the negative sign
          lookControls.yawObject.rotation.y += moveDeltaX;
          
          // Vertical rotation remains the same
          const newPitch = lookControls.pitchObject.rotation.x + moveDeltaY;
          lookControls.pitchObject.rotation.x = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, newPitch));
        }
      }
    }
    
    this.prevMouseX = touch.clientX;
    this.prevMouseY = touch.clientY;
  },

  onTouchEnd: function (evt) {
    if (DeviceManager.isMobile) {
      // On mobile, only allow button interactions
      return;
    }

    // Original touch handling for non-mobile devices
    if (!this.isSwiping) {
      const currentTime = Date.now();
      const tapLength = currentTime - this.lastTapTime;
      
      if (tapLength < 500 && tapLength > 0) {
        if (this.heldObject && !this.inspectionMode) {
          this.dropObject();
        }
      } else if (!this.heldObject) {
        const cursor = document.querySelector('#cursor');
        const intersection = cursor.components.raycaster.intersections[0];

        if (intersection) {
          const clickedEl = intersection.object.el;
          if (clickedEl.classList.contains('pickupable')) {
            this.pickupObject(clickedEl);
          }
        }
      }
      
      this.lastTapTime = currentTime;
    }
    
    this.isSwiping = false;
  },

  toggleInspectionMode: function () {
    if (!this.heldObject) return;
    
    // Clear the physics timeout if it exists
    if (this._physicsTimeout) {
      clearTimeout(this._physicsTimeout);
      this._physicsTimeout = null;
    }
    
    this.inspectionMode = !this.inspectionMode;
    
    // Update cursor color
    if (this.cursor) {
      this.cursor.setAttribute('material', 'color', this.inspectionMode ? 'red' : 'lime');
    }

    const el = this.heldObject;
    
    if (this.inspectionMode) {
      // Store current transform for inspection mode
      this._savedPosition = el.object3D.position.clone();
      this._savedQuaternion = el.object3D.quaternion.clone();
      
      // Disable physics during inspection
      el.removeAttribute('physx-body');
      
      // Remove tick listener to avoid position updates
      if (this._tickFunction) {
        this.el.sceneEl.removeEventListener('tick', this._tickFunction);
        this._tickFunction = null;
      }
      
      // Disable controls
      this.camera.setAttribute('look-controls', 'enabled', false);
      this.camera.setAttribute('wasd-controls', 'enabled', false);
      
      // Ensure object maintains position
      requestAnimationFrame(() => {
        el.object3D.position.copy(this._savedPosition);
        el.object3D.quaternion.copy(this._savedQuaternion);
        el.object3D.updateMatrix();
      });
    } else {
      // Exit inspection mode
      if (!DeviceManager.isMobile) {
        document.body.requestPointerLock();
      }
      
      // Re-enable controls
      this.camera.setAttribute('look-controls', {
        enabled: true,
        pointerLockEnabled: !DeviceManager.isMobile
      });
      this.camera.setAttribute('wasd-controls', 'enabled', true);

      // First remove any existing physics
      el.removeAttribute('physx-body');
      
      // Then reapply physics in the next frame
      requestAnimationFrame(() => {
        // Apply kinematic physics to allow movement while held
        el.setAttribute('physx-body', {
          type: 'kinematic',
          mass: 1,
          restitution: 0.3,
          friction: 0.5,
          linearDamping: 0.1,
          angularDamping: 0.1
        });
        
        // Ensure object maintains its current position
        el.object3D.updateMatrix();
        
        // Restore tick function for position updates
        this._tickFunction = this.tick.bind(this);
        this.el.sceneEl.addEventListener('tick', this._tickFunction);
      });
    }
  },

  onMouseMove: function (evt) {
    if (!this.inspectionMode || !this.heldObject) return;

    const deltaX = evt.movementX * 0.005;
    const deltaY = evt.movementY * 0.005;

    this.heldObject.object3D.rotateY(-deltaX);
    this.heldObject.object3D.rotateX(deltaY);
  }
});

// Arrow Controls Component
AFRAME.registerComponent('arrow-controls', {
  init: function() {
    this.moveState = {
      up: false,
      down: false,
      left: false,
      right: false
    };

    const arrowControls = document.createElement('div');
    arrowControls.className = 'arrow-controls';

    const buttons = {
      up: '↑',
      left: '←',
      right: '→',
      down: '↓'
    };

    const actionButtons = {
      pickup: 'PICKUP/DROP',
      examine: 'EXAMINE'
    };

    Object.entries(buttons).forEach(([direction, symbol]) => {
      const btn = document.createElement('button');
      btn.className = 'arrow-btn';
      btn.id = `${direction}Btn`;
      btn.innerHTML = symbol;
      
      ['mousedown', 'touchstart'].forEach(eventType => {
        btn.addEventListener(eventType, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.moveState[direction] = true;
        }, { capture: true });
      });

      ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(eventType => {
        btn.addEventListener(eventType, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.moveState[direction] = false;
        }, { capture: true });
      });

      // Prevent any touch move events from propagating
      btn.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true });

      arrowControls.appendChild(btn);
    });

    Object.entries(actionButtons).forEach(([action, label]) => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.id = `${action}Btn`;
      btn.innerHTML = label;
      
      ['click', 'touchend'].forEach(eventType => {
        btn.addEventListener(eventType, (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const scene = document.querySelector('a-scene');
          const controls = scene.components['desktop-and-mobile-controls'];
          if (!controls) return;
          
          if (action === 'pickup') {
            const cursor = document.querySelector('#cursor');
            const intersection = cursor.components.raycaster.intersections[0];

            if (intersection) {
              const clickedEl = intersection.object.el;
              if (clickedEl.classList.contains('pickupable')) {
                if (controls.heldObject) {
                  // Only allow dropping if not in inspection mode
                  if (!controls.inspectionMode) {
                    controls.dropObject();
                  }
                } else {
                  controls.pickupObject(clickedEl);
                }
              }
            }
          } else if (action === 'examine') {
            if (controls.heldObject) {
              controls.toggleInspectionMode();
            }
          }
        });
      });

      arrowControls.appendChild(btn);
    });

    document.body.appendChild(arrowControls);

    this.tick = this.tick.bind(this);
  },

  tick: function() {
    if (!this.moveState) return;
    
    const camera = document.querySelector('#camera');
    if (!camera) return;
    
    const rotation = camera.object3D.rotation.y;
    const moveSpeed = 0.15;

    if (this.moveState.up) {
      camera.object3D.position.x -= Math.sin(rotation) * moveSpeed;
      camera.object3D.position.z -= Math.cos(rotation) * moveSpeed;
    }
    if (this.moveState.down) {
      camera.object3D.position.x += Math.sin(rotation) * moveSpeed;
      camera.object3D.position.z += Math.cos(rotation) * moveSpeed;
    }
    if (this.moveState.left) {
      camera.object3D.position.x -= Math.cos(rotation) * moveSpeed;
      camera.object3D.position.z += Math.sin(rotation) * moveSpeed;
    }
    if (this.moveState.right) {
      camera.object3D.position.x += Math.cos(rotation) * moveSpeed;
      camera.object3D.position.z -= Math.sin(rotation) * moveSpeed;
    }
  }
});

// Update the scene-loading-check component
AFRAME.registerComponent('scene-loading-check', {
  init: function() {
    const scene = this.el;
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    // Hide scene initially
    scene.setAttribute('visible', false);

    // Simple timeout to show scene
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
      scene.setAttribute('visible', true);
    }, 2000);
  }
});

// Simplify the fixed-floor component
AFRAME.registerComponent('fixed-floor', {
  tick: function() {
    // Simple but effective approach - just keep resetting position every frame
    this.el.object3D.position.set(0, 0, 0);
    this.el.object3D.rotation.set(0, 0, 0);
  }
});

window.addEventListener('load', async () => {
  await DeviceManager.init();
  LookModeManager.init();
}); 