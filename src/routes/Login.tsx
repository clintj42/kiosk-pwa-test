import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import * as faceapi from "face-api.js";
import type { TNetInput } from "face-api.js";
import AuthIdle from "../assets/images/auth-idle.svg";
import AuthFace from "../assets/images/auth-face.svg";
import { accounts } from "./loginAccounts";

export type Account = (typeof accounts)[0];

// List of all model files that need to be cached
const MODEL_FILES = [
  "/models/ssd_mobilenetv1_model-weights_manifest.json",
  "/models/ssd_mobilenetv1_model-shard1",
  "/models/ssd_mobilenetv1_model-shard2",
  "/models/face_landmark_68_model-weights_manifest.json",
  "/models/face_landmark_68_model-shard1",
  "/models/face_recognition_model-weights_manifest.json",
  "/models/face_recognition_model-shard1",
  "/models/face_recognition_model-shard2",
] as const;

export const Login = () => {
  const [tempAccount, setTempAccount] = useState<Account | null>(null);
  const [localUserStream, setLocalUserStream] = useState<MediaStream | null>(
    null
  );
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [loginResult, setLoginResult] = useState("PENDING");
  const [imageError, setImageError] = useState(false);
  const [counter, setCounter] = useState(5);
  const [labeledFaceDescriptors, setLabeledFaceDescriptors] = useState<
    faceapi.LabeledFaceDescriptors[]
  >([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceApiIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoWidth = 640;
  const videoHeight = 360;

  const navigate = useNavigate();

  const MATCH_THRESHOLD = 0.6;

  // Pre-cache all model files and user images to Cache API
  const cacheModelFiles = useCallback(async () => {
    if (!("caches" in window)) {
      console.warn("Cache API not supported");
      return;
    }

    try {
      const modelsCache = await caches.open("face-api-models");
      const imagesCache = await caches.open("user-profile-images");

      // Cache model files
      const modelCachePromises = [];
      for (const file of MODEL_FILES) {
        const cached = await modelsCache.match(file);
        if (!cached) {
          modelCachePromises.push(
            modelsCache.add(file).catch((err) => {
              console.warn(`Failed to cache ${file}:`, err);
            })
          );
        }
      }

      // Cache user profile images
      const imageCachePromises = [];
      for (const account of accounts) {
        const picturePath = account.picture.startsWith("/")
          ? account.picture.substring(1)
          : account.picture;
        const imgPath = `/temp-accounts/${picturePath}`;
        const cached = await imagesCache.match(imgPath);
        if (!cached) {
          imageCachePromises.push(
            imagesCache.add(imgPath).catch((err) => {
              console.warn(`Failed to cache image ${imgPath}:`, err);
            })
          );
        }
      }

      const allPromises = [...modelCachePromises, ...imageCachePromises];
      if (allPromises.length > 0) {
        console.log(
          `Caching ${modelCachePromises.length} model files and ${imageCachePromises.length} user images...`
        );
        await Promise.allSettled(allPromises);
        console.log("Caching completed");
      } else {
        console.log("All files already cached");
      }
    } catch (error) {
      console.warn("Failed to open cache:", error);
    }
  }, []);

  const loadModels = useCallback(async () => {
    const uri = "/models";

    // Pre-cache model files (this will be quick if already cached)
    await cacheModelFiles();

    // Load models - they will use cached versions if available
    await faceapi.nets.ssdMobilenetv1.loadFromUri(uri);
    await faceapi.nets.faceLandmark68Net.loadFromUri(uri);
    await faceapi.nets.faceRecognitionNet.loadFromUri(uri);
    console.log("Models loaded successfully");
  }, [cacheModelFiles]);

  useEffect(() => {
    loadModels()
      .then(async () => {
        const allLabeledFaceDescriptors = await loadAllLabeledImages();
        setLabeledFaceDescriptors(allLabeledFaceDescriptors);
      })
      .then(() => setModelsLoaded(true))
      .catch((err) => {
        console.error("Error loading models or images:", err);
        setImageError(true);
      });
  }, [loadModels]);

  useEffect(() => {
    if (loginResult === "SUCCESS" && tempAccount) {
      const counterInterval = setInterval(() => {
        setCounter((counter) => counter - 1);
      }, 1000);

      return () => clearInterval(counterInterval);
    } else if (loginResult !== "SUCCESS") {
      setCounter(5);
    }
  }, [loginResult, tempAccount]);

  useEffect(() => {
    if (loginResult === "SUCCESS" && tempAccount && counter === 0) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (localUserStream) {
        localUserStream.getTracks().forEach((track) => {
          track.stop();
        });
      }
      if (faceApiIntervalRef.current) {
        clearInterval(faceApiIntervalRef.current);
      }
      localStorage.setItem(
        "faceAuth",
        JSON.stringify({ status: true, account: tempAccount })
      );
      navigate("/protected", { replace: true });
    }
  }, [loginResult, counter, tempAccount, localUserStream, navigate]);

  const getLocalUserVideo = async () => {
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setLocalUserStream(stream);
      })
      .catch((err) => {
        console.error("error:", err);
      });
  };

  const scanFace = async () => {
    if (canvasRef.current && videoRef.current) {
      faceapi.matchDimensions(canvasRef.current, videoRef.current);
    }
    const faceApiInterval = setInterval(async () => {
      const detections = await faceapi
        .detectAllFaces(videoRef.current as TNetInput)
        .withFaceLandmarks()
        .withFaceDescriptors();
      const resizedDetections = faceapi.resizeResults(detections, {
        width: videoWidth,
        height: videoHeight,
      });

      if (!canvasRef.current || labeledFaceDescriptors.length === 0) {
        return;
      }

      const faceMatcher = new faceapi.FaceMatcher(
        labeledFaceDescriptors,
        MATCH_THRESHOLD
      );

      const results = resizedDetections.map((d) =>
        faceMatcher.findBestMatch(d.descriptor)
      );

      canvasRef.current
        ?.getContext("2d")
        ?.clearRect(0, 0, videoWidth, videoHeight);
      faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
      faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);

      // If we find a match with distance below threshold, log in as that user
      if (results.length > 0 && results[0].distance < MATCH_THRESHOLD) {
        const matchedUserId = results[0].label;
        const matchedAccount = accounts.find((acc) => acc.id === matchedUserId);

        if (matchedAccount && !tempAccount) {
          setTempAccount(matchedAccount);
          setLoginResult("SUCCESS");
        } else if (tempAccount && tempAccount.id === matchedUserId) {
          setLoginResult("SUCCESS");
        } else {
          setLoginResult("FAILED");
        }
      } else {
        setLoginResult("FAILED");
      }

      if (!faceApiLoaded) {
        setFaceApiLoaded(true);
      }
    }, 1000 / 15);
    faceApiIntervalRef.current = faceApiInterval;
  };

  async function loadAllLabeledImages() {
    const allLabeledFaceDescriptors = [];

    for (const account of accounts) {
      try {
        // Handle paths that may or may not start with "/"
        const picturePath = account.picture.startsWith("/")
          ? account.picture.substring(1) // Remove leading slash
          : account.picture;
        const imgPath = `/temp-accounts/${picturePath}`;
        const img = await faceapi.fetchImage(imgPath);

        const detections = await faceapi
          .detectSingleFace(img)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detections) {
          const descriptions = [detections.descriptor];
          const labeledFaceDescriptor = new faceapi.LabeledFaceDescriptors(
            account.id,
            descriptions
          );
          allLabeledFaceDescriptors.push(labeledFaceDescriptor);
        }
      } catch (error) {
        console.error(`Error loading image for ${account.fullName}:`, error);
        // Continue with other accounts even if one fails
      }
    }

    return allLabeledFaceDescriptors;
  }

  if (imageError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-[24px] max-w-[840px] mx-auto">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-rose-700 sm:text-4xl">
          <span className="block">
            Oops! There is no profile picture associated with this account.
          </span>
        </h2>
        <span className="block mt-4">
          Please contact administration for registration or try again later.
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-[24px] max-w-[720px] mx-auto">
      {!localUserStream && !modelsLoaded && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          <span className="block">
            You&apos;re Attempting to Log In With Your Face.
          </span>
          <span className="block text-indigo-600 mt-2">Loading Models...</span>
        </h2>
      )}
      {!localUserStream && modelsLoaded && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          <span className="block text-indigo-600 mt-2">
            Please Recognize Your Face to Completely Log In
          </span>
        </h2>
      )}
      {localUserStream && loginResult === "SUCCESS" && tempAccount && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          <span className="block text-indigo-600 mt-2">
            We&apos;ve successfully recognized your face!
          </span>
          <span className="block text-indigo-600 mt-2">
            Logging in as {tempAccount.fullName}...
          </span>
          <span className="block text-indigo-600 mt-2">
            Please stay {counter} more seconds...
          </span>
        </h2>
      )}
      {localUserStream && loginResult === "FAILED" && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-rose-700 sm:text-4xl">
          <span className="block mt-[56px]">
            Oops! We did not recognize your face.
          </span>
        </h2>
      )}
      {localUserStream && !faceApiLoaded && loginResult === "PENDING" && (
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          <span className="block mt-[56px]">Scanning Face...</span>
        </h2>
      )}
      <div className="w-full">
        <div className="relative flex flex-col items-center p-[10px]">
          <video
            muted
            autoPlay
            ref={videoRef}
            height={videoHeight}
            width={videoWidth}
            onPlay={scanFace}
            style={{
              objectFit: "fill",
              height: "360px",
              borderRadius: "10px",
              display: localUserStream ? "block" : "none",
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              display: localUserStream ? "block" : "none",
            }}
          />
        </div>
        {!localUserStream && (
          <>
            {modelsLoaded ? (
              <>
                <img
                  alt="loading models"
                  src={AuthFace}
                  className="cursor-pointer my-8 mx-auto object-cover h-[272px]"
                />
                <button
                  onClick={getLocalUserVideo}
                  type="button"
                  className="flex justify-center items-center w-full py-2.5 px-5 mr-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg border border-gray-200 inline-flex items-center"
                >
                  Scan my face
                </button>
              </>
            ) : (
              <>
                <img
                  alt="loading models"
                  src={AuthIdle}
                  className="cursor-pointer my-8 mx-auto object-cover h-[272px]"
                />
                <button
                  disabled
                  type="button"
                  className="cursor-not-allowed flex justify-center items-center w-full py-2.5 px-5 text-sm font-medium text-gray-900 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 inline-flex items-center"
                >
                  <svg
                    aria-hidden="true"
                    role="status"
                    className="inline mr-2 w-4 h-4 text-gray-200 animate-spin"
                    viewBox="0 0 100 101"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                      fill="currentColor"
                    />
                    <path
                      d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                      fill="#1C64F2"
                    />
                  </svg>
                  Please wait while models were loading...
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
