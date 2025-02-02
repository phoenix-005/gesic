import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import "@tensorflow/tfjs-backend-webgl"; // Register WebGL backend
import * as Tone from "tone"; // Import Tone.js for music

const WebcamDisplay = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // Hidden canvas for hand detection
  const streakCanvasRef = useRef(null); // Overlay canvas for animated strokes

  // Refs for note display boxes.
  const leftNoteRef = useRef(null);
  const rightNoteRef = useRef(null);

  // Store separate trails for left and right index fingers.
  const trail = useRef({ Left: [], Right: [] });
  // (No longer needed: const lastNoteTime = useRef({ Left: 0, Right: 0 });)

  const [detector, setDetector] = useState(null);
  // State to track when all samples have loaded.
  const [samplesLoaded, setSamplesLoaded] = useState(false);

  // Add a ref to track whether a note is currently being held for each hand.
  const notePlaying = useRef({ Left: false, Right: false });

  // Create separate samplers for left and right hands.
  // (Chained with a Reverb for a "violin"-like sound.)
  const leftSynth = useRef(
    new Tone.Sampler({
      urls: {
        "F5": "F5.mp3",
      },
      baseUrl: "/samples/violin/",
    })
      .toDestination()
      .chain(new Tone.Reverb({ decay: 4, preDelay: 0.01 }).toDestination())
  );

  const rightSynth = useRef(
    new Tone.Sampler({
      urls: {
        "C5": "C5.mp3",
      },
      baseUrl: "/samples/violin/",
    })
      .toDestination()
      .chain(new Tone.Reverb({ decay: 4, preDelay: 0.01 }).toDestination())
  );

  // Use Tone's global loading mechanism.
  useEffect(() => {
    Tone.loaded().then(() => {
      console.log("All samples loaded!");
      setSamplesLoaded(true);
    });
  }, []);

  // Start webcam and load the hand pose detection model.
  useEffect(() => {
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          console.log("✅ Webcam started successfully.");
        }
      } catch (error) {
        console.error("❌ Error accessing webcam:", error);
      }
    };

    const loadHandPose = async () => {
      try {
        console.log("⏳ Setting TensorFlow.js backend...");
        await tf.setBackend("webgl");
        await tf.ready();
        console.log("✅ TensorFlow.js is ready!");

        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
          runtime: "tfjs",
          modelType: "full",
          maxHands: 2,
        };

        const handDetector = await handPoseDetection.createDetector(
          model,
          detectorConfig
        );
        setDetector(handDetector);
        console.log("✅ Hand Pose model loaded successfully!");
      } catch (error) {
        console.error("❌ Error loading hand pose model:", error);
      }
    };

    startWebcam();
    loadHandPose();
  }, []);

  // --- Helper Functions ---

  // Smooth the raw points with a simple moving average.
  const smoothPath = (points, iterations = 2) => {
    let smoothed = points.slice();
    for (let iter = 0; iter < iterations; iter++) {
      smoothed = smoothed.map((p, i, arr) => {
        // Keep endpoints unchanged.
        if (i === 0 || i === arr.length - 1) return p;
        return {
          x: (arr[i - 1].x + arr[i].x + arr[i + 1].x) / 3,
          y: (arr[i - 1].y + arr[i].y + arr[i + 1].y) / 3,
          t: p.t,
        };
      });
    }
    return smoothed;
  };

  // Draw a variable-width, smooth stroke as a filled polygon.
  const drawVariableWidthStroke = (ctx, points, maxWidth, gradientCallback) => {
    if (points.length < 2) return;

    // Compute cumulative distances along the stroke.
    let distances = [0];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      distances.push(distances[i - 1] + Math.hypot(dx, dy));
    }
    const totalLength = distances[points.length - 1];

    // Compute thickness at each point: maximum at the middle, tapering to the ends.
    const thicknesses = points.map((p, i) => {
      const t = totalLength === 0 ? 0 : distances[i] / totalLength;
      return maxWidth * (1 - Math.abs(t - 0.5) * 2) || 1;
    });

    // Compute left and right offset points from the stroke center.
    const leftOffsets = [];
    const rightOffsets = [];
    for (let i = 0; i < points.length; i++) {
      let dx, dy;
      if (i === 0) {
        dx = points[i + 1].x - points[i].x;
        dy = points[i + 1].y - points[i].y;
      } else if (i === points.length - 1) {
        dx = points[i].x - points[i - 1].x;
        dy = points[i].y - points[i - 1].y;
      } else {
        // Average direction: from the previous to the next point.
        dx = points[i + 1].x - points[i - 1].x;
        dy = points[i + 1].y - points[i - 1].y;
      }
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // Perpendicular vector.
      const perpX = -dy;
      const perpY = dx;
      const halfWidth = thicknesses[i];
      leftOffsets.push({
        x: points[i].x + perpX * halfWidth,
        y: points[i].y + perpY * halfWidth,
      });
      rightOffsets.push({
        x: points[i].x - perpX * halfWidth,
        y: points[i].y - perpY * halfWidth,
      });
    }

    // Build the polygon path.
    ctx.beginPath();
    // Left edge.
    ctx.moveTo(leftOffsets[0].x, leftOffsets[0].y);
    for (let i = 1; i < leftOffsets.length; i++) {
      ctx.lineTo(leftOffsets[i].x, leftOffsets[i].y);
    }
    // Right edge (in reverse order).
    for (let i = rightOffsets.length - 1; i >= 0; i--) {
      ctx.lineTo(rightOffsets[i].x, rightOffsets[i].y);
    }
    ctx.closePath();

    // Set the fill style (using the provided gradient callback).
    if (typeof gradientCallback === "function") {
      const fillStyle = gradientCallback(points);
      ctx.fillStyle = fillStyle;
    }
    ctx.fill();
  };

  // --- Main Detection & Drawing Loop ---
  useEffect(() => {
    if (!detector) return;

    const detectPose = async () => {
      try {
        if (videoRef.current && videoRef.current.readyState === 4) {
          // Use a hidden canvas matching the intrinsic video resolution.
          const detectionCanvas = canvasRef.current;
          const dCtx = detectionCanvas.getContext("2d");
          detectionCanvas.width = videoRef.current.videoWidth;
          detectionCanvas.height = videoRef.current.videoHeight;
          dCtx.drawImage(
            videoRef.current,
            0,
            0,
            detectionCanvas.width,
            detectionCanvas.height
          );

          const hands = await detector.estimateHands(detectionCanvas, {
            flipHorizontal: true,
          });

          // Determine displayed video dimensions & compute scaling factor.
          const videoRect = videoRef.current.getBoundingClientRect();
          const videoClientWidth = videoRect.width;
          const videoClientHeight = videoRect.height;
          const scale = Math.max(
            videoClientWidth / videoRef.current.videoWidth,
            videoClientHeight / videoRef.current.videoHeight
          );
          const displayedWidth = videoRef.current.videoWidth * scale;
          const displayedHeight = videoRef.current.videoHeight * scale;
          const offsetX = (displayedWidth - videoClientWidth) / 2;
          const offsetY = (displayedHeight - videoClientHeight) / 2;

          const now = Date.now();
          const trailLifetime = 1000; // Each trail lasts for 1 second.

          // Process each detected hand.
          hands.forEach((hand) => {
            // Use the index finger MCP and thumb tip for touch detection.
            const indexFingerMCP = hand.keypoints.find(
              (k) => k.name === "index_finger_mcp"
            );
            const thumbTip = hand.keypoints.find(
              (k) => k.name === "thumb_tip"
            );
            const handLabel = hand.handedness; // "Left" or "Right"
            if (indexFingerMCP && thumbTip) {
              const dx = indexFingerMCP.x - thumbTip.x;
              const dy = indexFingerMCP.y - thumbTip.y;
              const distanceTouch = Math.sqrt(dx * dx + dy * dy);
              const touchThreshold = 30; // Adjust as needed.
              if (distanceTouch < touchThreshold) {
                // Map the index finger MCP to the overlay canvas coordinates.
                const scaledX = indexFingerMCP.x * scale - offsetX;
                const scaledY = indexFingerMCP.y * scale - offsetY;
                if (!trail.current[handLabel]) {
                  trail.current[handLabel] = [];
                }
                trail.current[handLabel].push({ x: scaledX, y: scaledY, t: now });
              } else {
                // If not touching, clear the trail.
                trail.current[handLabel] = [];
              }
            } else {
              // If keypoints are missing, clear the trail.
              trail.current[hand.handedness] = [];
            }
          });

          // Remove trail points older than the trailLifetime.
          Object.keys(trail.current).forEach((handLabel) => {
            trail.current[handLabel] = trail.current[handLabel].filter(
              (p) => now - p.t < trailLifetime
            );
          });

          // Update note display boxes.
          if (leftNoteRef.current) {
            leftNoteRef.current.innerText =
              trail.current.Left && trail.current.Left.length > 0 ? "F5" : "";
          }
          if (rightNoteRef.current) {
            rightNoteRef.current.innerText =
              trail.current.Right && trail.current.Right.length > 0 ? "C5" : "";
          }

          // --- Music Triggering: Sustain Notes Until Movement Stops ---
          // Only run if samples are loaded.
          if (samplesLoaded) {
            // Define thresholds.
            const thresholdDistance = 10; // Minimum movement (in pixels) to trigger an attack.
            const maxDistance = 50; // Distance at which full velocity is reached.

            // For each hand, check if the finger is touching (trail exists).
            Object.keys(trail.current).forEach((handLabel) => {
              const points = trail.current[handLabel];
              if (points && points.length >= 2) {
                // Finger is actively touching/moving.
                if (!notePlaying.current[handLabel]) {
                  // Compute movement velocity from the last two points.
                  const lastPoint = points[points.length - 1];
                  const prevPoint = points[points.length - 2];
                  const dx = lastPoint.x - prevPoint.x;
                  const dy = lastPoint.y - prevPoint.y;
                  const dist = Math.hypot(dx, dy);
                  if (dist > thresholdDistance) {
                    const velocity = Math.min(dist / maxDistance, 1);
                    if (handLabel === "Left") {
                      leftSynth.current.triggerAttack("F5", undefined, velocity);
                    } else if (handLabel === "Right") {
                      rightSynth.current.triggerAttack("C5", undefined, velocity);
                    }
                    notePlaying.current[handLabel] = true;
                  }
                }
              } else {
                // If there is no active touch (trail is empty) and a note is held, release it.
                if (notePlaying.current[handLabel]) {
                  if (handLabel === "Left") {
                    leftSynth.current.triggerRelease("F5");
                  } else if (handLabel === "Right") {
                    rightSynth.current.triggerRelease("C5");
                  }
                  notePlaying.current[handLabel] = false;
                }
              }
            });
          }

          // --- Draw the Animated Brush-Like Strokes ---
          const overlayCanvas = streakCanvasRef.current;
          if (overlayCanvas) {
            overlayCanvas.width = videoClientWidth;
            overlayCanvas.height = videoClientHeight;
            const aCtx = overlayCanvas.getContext("2d");

            // Fade previous drawings for a trailing effect.
            aCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
            aCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            // For each hand's trail, smooth the path and draw a variable-width stroke.
            Object.keys(trail.current).forEach((handLabel) => {
              const points = trail.current[handLabel];
              if (points && points.length > 1) {
                const smoothedPoints = smoothPath(points, 2);

                // Create a gradient based on the first and last points.
                const gradientCallback = (pts) => {
                  const grad = aCtx.createLinearGradient(
                    pts[0].x,
                    pts[0].y,
                    pts[pts.length - 1].x,
                    pts[pts.length - 1].y
                  );
                  if (handLabel === "Left") {
                    // Orangish gradient for left hand.
                    grad.addColorStop(0, "rgba(255, 165, 0, 0.8)"); // Orange
                    grad.addColorStop(0.5, "rgba(255, 200, 120, 0.2)"); // Lighter orange
                    grad.addColorStop(1, "rgba(255, 165, 0, 0.8)");
                    aCtx.shadowColor = "rgba(255, 165, 0, 0.5)";
                  } else {
                    // Cyan gradient for right hand.
                    grad.addColorStop(0, "rgba(0, 255, 255, 0.8)");
                    grad.addColorStop(0.5, "rgba(150, 255, 255, 0.2)");
                    grad.addColorStop(1, "rgba(0, 255, 255, 0.8)");
                    aCtx.shadowColor = "rgba(0, 255, 255, 0.5)";
                  }
                  return grad;
                };

                // Draw the stroke with a maximum half-width of 10 (adjust as desired).
                drawVariableWidthStroke(aCtx, smoothedPoints, 10, gradientCallback);
              }
            });
          }
        }
      } catch (error) {
        console.error("❌ Error detecting pose:", error);
      }
      requestAnimationFrame(detectPose);
    };

    detectPose();
  }, [detector, samplesLoaded]); // Include samplesLoaded as a dependency.

  return (
    // Outer container: full viewport with a black background.
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#000",
      }}
    >
      {/* Video container covering 90% of the viewport */}
      <div style={{ position: "relative", width: "90vw", height: "90vh" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            border: "5px solid #fff",
            borderRadius: "10px",
            transform: "scaleX(-1)", // Mirror the video horizontally.
          }}
        ></video>
        {/* Overlay canvas that exactly covers the video */}
        <canvas
          ref={streakCanvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />
        {/* Hidden canvas used for hand detection */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Note display boxes */}
        <div
          ref={leftNoteRef}
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "white",
            width: "50px",
            height: "50px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            fontSize: "16px",
            transition: "all 0.3s ease",
          }}
        >
          {/* Displays "F5" when triggered */}
        </div>
        <div
          ref={rightNoteRef}
          style={{
            position: "absolute",
            bottom: "10px",
            right: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            color: "white",
            width: "50px",
            height: "50px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            fontSize: "16px",
            transition: "all 0.3s ease",
          }}
        >
          {/* Displays "C5" when triggered */}
        </div>
      </div>
    </div>
  );
};

export default WebcamDisplay;
