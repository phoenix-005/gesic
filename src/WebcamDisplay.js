import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import "@tensorflow/tfjs-backend-webgl"; // Register WebGL backend
import * as Tone from "tone"; // Import Tone.js for music

const WebcamDisplay = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // Hidden canvas used for hand detection
  const streakCanvasRef = useRef(null); // Overlay canvas for animated strokes

  // We'll store separate trails for the left and right index fingers.
  const trail = useRef({ Left: [], Right: [] });
  const [detector, setDetector] = useState(null);

  // Initialize Tone.js Synth (still available if needed)
  const synth = useRef(new Tone.Synth().toDestination());

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

  const mapPositionToNote = (y) => {
    const notes = [
      "C6", "C4#", "D6", "E6", "F6", "G4", "A4", "B4",
      "C5", "D5", "E5", "F5", "G5", "A5", "B5",
    ];
    const index = Math.floor((y / window.innerHeight) * notes.length);
    return notes[Math.min(index, notes.length - 1)];
  };

  useEffect(() => {
    if (!detector) return;

    const detectPose = async () => {
      try {
        if (videoRef.current && videoRef.current.readyState === 4) {
          // --- Hand Detection using the hidden canvas ---
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

          // --- Determine displayed video dimensions & compute scale ---
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
          const trailLifetime = 1000; // Trail lifetime in milliseconds

          // --- Update trails for each detected hand ---
          hands.forEach((hand) => {
            const indexFingerTip = hand.keypoints.find(
              (k) => k.name === "index_finger_tip"
            );
            if (indexFingerTip) {
              // Map the detected keypoint to the overlay canvas coordinates.
              const scaledX = indexFingerTip.x * scale - offsetX;
              const scaledY = indexFingerTip.y * scale - offsetY;
              const handLabel = hand.handedness; // "Left" or "Right"
              if (!trail.current[handLabel]) {
                trail.current[handLabel] = [];
              }
              trail.current[handLabel].push({ x: scaledX, y: scaledY, t: now });

              // const note = mapPositionToNote(indexFingerTip.y);
              // synth.current.triggerAttackRelease(note, "8n");
            }
          });

          // --- Remove old trail points ---
          Object.keys(trail.current).forEach((handLabel) => {
            trail.current[handLabel] = trail.current[handLabel].filter(
              (p) => now - p.t < trailLifetime
            );
          });

          // --- Draw the animated brush-like strokes on the overlay canvas ---
          const overlayCanvas = streakCanvasRef.current;
          if (overlayCanvas) {
            overlayCanvas.width = videoClientWidth;
            overlayCanvas.height = videoClientHeight;
            const aCtx = overlayCanvas.getContext("2d");

            aCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
            aCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            // Draw a stroke for each hand's trail.
            Object.keys(trail.current).forEach((handLabel) => {
              const points = trail.current[handLabel];
              if (points && points.length > 1) {
                aCtx.beginPath();
                aCtx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                  aCtx.lineTo(points[i].x, points[i].y);
                }
                // Set brush properties.
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
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#000",
      }}
    >
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
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
};

export default WebcamDisplay;
