import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import "@tensorflow/tfjs-backend-webgl"; // Register WebGL backend
import * as Tone from "tone"; // Import Tone.js for music

const WebcamDisplay = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // Hidden canvas for hand detection
  const streakCanvasRef = useRef(null); // Overlay canvas for animated strokes

  // Store separate trails for left and right index fingers.
  const trail = useRef({ Left: [], Right: [] });
  // Store the last note trigger times for each hand.
  const lastNoteTime = useRef({ Left: 0, Right: 0 });

  const [detector, setDetector] = useState(null);

  // Create separate synths for left and right hands.
  // Replace the default synths with synthesized "violin" sounds:
  const leftSynth = useRef(
    new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 12,
      oscillator: { type: "sawtooth" },
      envelope: {
        attack: 1.2,
        decay: 0.3,
        sustain: 0.6,
        release: 1.8,
      },
      modulation: { type: "sine" },
      modulationEnvelope: {
        attack: 1.2,
        decay: 0.3,
        sustain: 0.6,
        release: 1.8,
      },
    })
      .toDestination()
      // Optionally add a bit of reverb to enhance the sound:
      .chain(new Tone.Reverb({ decay: 4, preDelay: 0.01 }).toDestination())
  );
  
  const rightSynth = useRef(
    new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 12,
      oscillator: { type: "sawtooth" },
      envelope: {
        attack: 1.2,
        decay: 0.3,
        sustain: 0.6,
        release: 1.8,
      },
      modulation: { type: "sine" },
      modulationEnvelope: {
        attack: 1.2,
        decay: 0.3,
        sustain: 0.6,
        release: 1.8,
      },
    })
      .toDestination()
      .chain(new Tone.Reverb({ decay: 4, preDelay: 0.01 }).toDestination())
  );

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

  useEffect(() => {
    if (!detector) return;

    const detectPose = async () => {
      try {
        if (videoRef.current && videoRef.current.readyState === 4) {
          // --- Hand Detection using the hidden canvas (intrinsic video resolution) ---
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

          // --- Determine displayed video dimensions & compute scale for "cover" mode ---
          const videoRect = videoRef.current.getBoundingClientRect();
          const videoClientWidth = videoRect.width;
          const videoClientHeight = videoRect.height;
          // Using objectFit "cover": scale by the larger factor.
          const scale = Math.max(
            videoClientWidth / videoRef.current.videoWidth,
            videoClientHeight / videoRef.current.videoHeight
          );
          const displayedWidth = videoRef.current.videoWidth * scale;
          const displayedHeight = videoRef.current.videoHeight * scale;
          // Calculate cropping offsets.
          const offsetX = (displayedWidth - videoClientWidth) / 2;
          const offsetY = (displayedHeight - videoClientHeight) / 2;

          const now = Date.now();
          const trailLifetime = 1000; // Trail lasts for 1 second

          // Process each detected hand.
          hands.forEach((hand) => {
            const indexFingerTip = hand.keypoints.find(
              (k) => k.name === "index_finger_tip"
            );
            if (indexFingerTip) {
              // Map the detected keypoint to overlay canvas coordinates.
              const scaledX = indexFingerTip.x * scale - offsetX;
              const scaledY = indexFingerTip.y * scale - offsetY;
              const handLabel = hand.handedness; // "Left" or "Right"
              if (!trail.current[handLabel]) {
                trail.current[handLabel] = [];
              }
              trail.current[handLabel].push({ x: scaledX, y: scaledY, t: now });
            }
          });

          // Remove trail points older than trailLifetime.
          Object.keys(trail.current).forEach((handLabel) => {
            trail.current[handLabel] = trail.current[handLabel].filter(
              (p) => now - p.t < trailLifetime
            );
          });

          // --- Music Triggering Based on Movement Distance ---
          // Define parameters:
          const thresholdDistance = 10; // Minimum distance (in pixels) to trigger a note.
          const noteInterval = 100; // Minimum time (ms) between note triggers.
          const maxDistance = 50; // Distance at which full velocity (1.0) is reached.

          Object.keys(trail.current).forEach((handLabel) => {
            const points = trail.current[handLabel];
            if (points && points.length >= 2) {
              const lastPoint = points[points.length - 1];
              const prevPoint = points[points.length - 2];
              const dx = lastPoint.x - prevPoint.x;
              const dy = lastPoint.y - prevPoint.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              // Only trigger a note if the finger has moved more than the threshold distance
              // and enough time has passed since the last note.
              if (
                dist > thresholdDistance &&
                now - lastNoteTime.current[handLabel] > noteInterval
              ) {
                // Map the movement distance to note velocity (volume).
                const velocity = Math.min(dist / maxDistance, 1);
                // Left hand always plays F5; right hand always plays C5.
                if (handLabel === "Left") {
                  leftSynth.current.triggerAttackRelease("F5", "8n", undefined, velocity);
                } else if (handLabel === "Right") {
                  rightSynth.current.triggerAttackRelease("C5", "8n", undefined, velocity);
                }
                lastNoteTime.current[handLabel] = now;
              }
            }
          });

          // --- Draw the animated brush-like strokes on the overlay canvas ---
          const overlayCanvas = streakCanvasRef.current;
          if (overlayCanvas) {
            overlayCanvas.width = videoClientWidth;
            overlayCanvas.height = videoClientHeight;
            const aCtx = overlayCanvas.getContext("2d");

            // Fade previous drawings for a trailing effect.
            aCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
            aCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            // Draw strokes for each hand.
            Object.keys(trail.current).forEach((handLabel) => {
              const points = trail.current[handLabel];
              if (points && points.length > 1) {
                aCtx.beginPath();
                aCtx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                  aCtx.lineTo(points[i].x, points[i].y);
                }
                aCtx.lineCap = "round";
                aCtx.lineJoin = "round";
                aCtx.lineWidth = 8;
                let grad;
                const start = points[0];
                const end = points[points.length - 1];
                if (handLabel === "Left") {
                  grad = aCtx.createLinearGradient(start.x, start.y, end.x, end.y);
                  grad.addColorStop(0, "rgba(255, 0, 255, 0.8)");    // Magenta
                  grad.addColorStop(0.5, "rgba(255, 150, 255, 0.2)");  // Lighter magenta
                  grad.addColorStop(1, "rgba(255, 0, 255, 0.8)");
                  aCtx.shadowColor = "rgba(255, 0, 255, 0.5)";
                } else {
                  grad = aCtx.createLinearGradient(start.x, start.y, end.x, end.y);
                  grad.addColorStop(0, "rgba(0, 255, 255, 0.8)");      // Cyan
                  grad.addColorStop(0.5, "rgba(150, 255, 255, 0.2)");    // Lighter cyan
                  grad.addColorStop(1, "rgba(0, 255, 255, 0.8)");
                  aCtx.shadowColor = "rgba(0, 255, 255, 0.5)";
                }
                aCtx.strokeStyle = grad;
                aCtx.shadowBlur = 10;
                aCtx.stroke();
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
  }, [detector]);

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
            transform: "scaleX(-1)", // Mirror the video horizontally
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
      </div>
    </div>
  );
};

export default WebcamDisplay;
