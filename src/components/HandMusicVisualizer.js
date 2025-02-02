import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import * as Tone from "tone";
import { smoothPath, drawVariableWidthStroke } from "../utils/drawingUtils";
import { createSynthSampler, noteMappings } from "../utils/audioEngine";

const HandMusicVisualizer = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null); // Used for hand detection
    const overlayCanvasRef = useRef(null); // Used for drawing the trails

    // Refs for note display boxes.
    const leftNoteRef = useRef(null);
    const rightNoteRef = useRef(null);

    // Store separate trails for left and right hands.
    const trail = useRef({ Left: [], Right: [] });
    const [detector, setDetector] = useState(null);
    const [samplesLoaded, setSamplesLoaded] = useState(false);

    // Track which note is currently active for each hand.
    const notePlaying = useRef({ Left: false, Right: false });

    // Create synth samplers for each hand.
    const leftSynth = useRef(createSynthSampler());
    const rightSynth = useRef(createSynthSampler());

    // Load the Tone.js samples.
    useEffect(() => {
        Tone.loaded().then(() => {
            console.log("Samples loaded.");
            setSamplesLoaded(true);
        });
    }, []);

    // Start the webcam and load the hand-pose model.
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
                    console.log("Webcam started.");
                }
            } catch (error) {
                console.error("Error accessing webcam:", error);
            }
        };

        const loadHandPose = async () => {
            try {
                await tf.setBackend("webgl");
                await tf.ready();
                const model = handPoseDetection.SupportedModels.MediaPipeHands;
                const detectorConfig = {
                    runtime: "tfjs",
                    modelType: "full",
                    maxHands: 2,
                };
                const handDetector = await handPoseDetection.createDetector(model, detectorConfig);
                setDetector(handDetector);
                console.log("Hand pose model loaded.");
            } catch (error) {
                console.error("Error loading hand pose model:", error);
            }
        };

        startWebcam();
        loadHandPose();
    }, []);

    // Main detection and drawing loop.
    useEffect(() => {
        if (!detector) return;

        const detectPose = async () => {
            try {
                if (videoRef.current && videoRef.current.readyState === 4) {
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

                    const hands = await detector.estimateHands(detectionCanvas, { flipHorizontal: true });

                    // Calculate scaling factors for mapping points to the displayed video.
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
                    const trailLifetime = 1000; // milliseconds

                    hands.forEach((hand) => {
                        const thumbTip = hand.keypoints[4];
                        if (!thumbTip) return;
                        const handLabel = hand.handedness; // "Left" or "Right"
                        const validPoints = [];
                        Object.keys(noteMappings).forEach((key) => {
                            const idx = Number(key);
                            const point = hand.keypoints[idx];
                            if (point) {
                                const dx = point.x - thumbTip.x;
                                const dy = point.y - thumbTip.y;
                                const distanceTouch = Math.hypot(dx, dy);
                                const touchThreshold = 30;
                                if (distanceTouch < touchThreshold) {
                                    const scaledX = point.x * scale - offsetX;
                                    const scaledY = point.y * scale - offsetY;
                                    validPoints.push({ x: scaledX, y: scaledY, t: now, note: noteMappings[key] });
                                }
                            }
                        });
                        if (validPoints.length > 0) {
                            if (!trail.current[handLabel]) {
                                trail.current[handLabel] = [];
                            }
                            trail.current[handLabel].push(...validPoints);
                        } else {
                            trail.current[handLabel] = [];
                        }
                    });

                    // Remove old trail points.
                    Object.keys(trail.current).forEach((handLabel) => {
                        trail.current[handLabel] = trail.current[handLabel].filter(
                            (p) => now - p.t < trailLifetime
                        );
                    });

                    // Update the note display boxes.
                    if (leftNoteRef.current) {
                        leftNoteRef.current.innerText =
                            trail.current.Left && trail.current.Left.length > 0
                                ? trail.current.Left[trail.current.Left.length - 1].note
                                : "";
                    }
                    if (rightNoteRef.current) {
                        rightNoteRef.current.innerText =
                            trail.current.Right && trail.current.Right.length > 0
                                ? trail.current.Right[trail.current.Right.length - 1].note
                                : "";
                    }

                    // Trigger or release notes based on movement.
                    if (samplesLoaded) {
                        const thresholdDistance = 10;
                        const maxDistance = 50;

                        Object.keys(trail.current).forEach((handLabel) => {
                            const points = trail.current[handLabel];
                            if (points && points.length >= 2) {
                                const firstPoint = points[0];
                                const lastPoint = points[points.length - 1];
                                const totalMovement = Math.hypot(lastPoint.x - firstPoint.x, lastPoint.y - firstPoint.y);
                                if (!notePlaying.current[handLabel] && totalMovement > thresholdDistance) {
                                    const velocity = Math.min(totalMovement / maxDistance, 1);
                                    if (handLabel === "Left") {
                                        leftSynth.current.triggerAttack(lastPoint.note, undefined, velocity);
                                    } else if (handLabel === "Right") {
                                        rightSynth.current.triggerAttack(lastPoint.note, undefined, velocity);
                                    }
                                    notePlaying.current[handLabel] = lastPoint.note;
                                }
                            } else {
                                if (notePlaying.current[handLabel]) {
                                    if (handLabel === "Left") {
                                        leftSynth.current.triggerRelease(notePlaying.current[handLabel]);
                                    } else if (handLabel === "Right") {
                                        rightSynth.current.triggerRelease(notePlaying.current[handLabel]);
                                    }
                                    notePlaying.current[handLabel] = false;
                                }
                            }
                        });
                    }

                    // Draw the brush-like trails.
                    const overlayCanvas = overlayCanvasRef.current;
                    if (overlayCanvas) {
                        overlayCanvas.width = videoClientWidth;
                        overlayCanvas.height = videoClientHeight;
                        const aCtx = overlayCanvas.getContext("2d");

                        Object.keys(trail.current).forEach((handLabel) => {
                            const points = trail.current[handLabel];
                            if (points && points.length > 1) {
                                const smoothedPoints = smoothPath(points, 4);

                                const gradientCallback = (pts) => {
                                    const grad = aCtx.createLinearGradient(
                                        pts[0].x,
                                        pts[0].y,
                                        pts[pts.length - 1].x,
                                        pts[pts.length - 1].y
                                    );
                                    if (handLabel === "Left") {
                                        grad.addColorStop(0, "rgba(255, 165, 0, 0.8)");
                                        grad.addColorStop(0.5, "rgba(255, 200, 120, 0.2)");
                                        grad.addColorStop(1, "rgba(255, 165, 0, 0.8)");
                                        aCtx.shadowColor = "rgba(255, 165, 0, 0.5)";
                                    } else {
                                        grad.addColorStop(0, "rgba(0, 255, 255, 0.8)");
                                        grad.addColorStop(0.5, "rgba(150, 255, 255, 0.2)");
                                        grad.addColorStop(1, "rgba(0, 255, 255, 0.8)");
                                        aCtx.shadowColor = "rgba(0, 255, 255, 0.5)";
                                    }
                                    return grad;
                                };

                                drawVariableWidthStroke(aCtx, smoothedPoints, 15, gradientCallback);
                            }
                        });
                    }
                }
            } catch (error) {
                console.error("Error during pose detection:", error);
            }
            requestAnimationFrame(detectPose);
        };

        detectPose();
    }, [detector, samplesLoaded]);

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
                        transform: "scaleX(-1)",
                    }}
                />
                <canvas
                    ref={overlayCanvasRef}
                    style={{
                        position: "absolute",
                        top: "5px",
                        left: "5px",
                        width: "calc(100% - 10px)",
                        height: "calc(100% - 10px)",
                        pointerEvents: "none",
                    }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />
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
                />
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
                />
            </div>
        </div>
    );
};

export default HandMusicVisualizer;
