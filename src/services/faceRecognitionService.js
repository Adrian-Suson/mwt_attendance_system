const path = require("path");
const fs = require("fs");
const faceapi = require("face-api.js");
const { imageFromBuffer, getImageData } = require("@canvas/image");

const FACE_DETECTOR = process.env.FACE_DETECTOR || "tiny";
const FACE_TINY_INPUT_SIZE = Number(process.env.FACE_TINY_INPUT_SIZE || 320);
const REQUIRED_MODEL_FILES = [
  ...(FACE_DETECTOR === "tiny"
    ? [
        "tiny_face_detector_model-weights_manifest.json",
        "tiny_face_detector_model-shard1",
      ]
    : [
        "ssd_mobilenetv1_model-weights_manifest.json",
        "ssd_mobilenetv1_model-shard1",
        "ssd_mobilenetv1_model-shard2",
      ]),
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
];
const configuredModelDir = process.env.FACE_MODEL_DIR || "models/face-api";
const modelDirCandidates = [
  path.isAbsolute(configuredModelDir)
    ? configuredModelDir
    : path.resolve(__dirname, "../..", configuredModelDir),
  path.resolve(__dirname, "../..", "models/face-api"),
  path.resolve(__dirname, "../..", "public/models/face-api"),
];
const MODEL_DIR =
  modelDirCandidates.find((directory) =>
    REQUIRED_MODEL_FILES.every((fileName) =>
      fs.existsSync(path.join(directory, fileName)),
    ),
  ) || modelDirCandidates[0];
const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.55);
const FACE_MATCH_MARGIN = Number(process.env.FACE_MATCH_MARGIN || 0.08);
const FACE_MIN_CONFIDENCE = Math.min(
  0.99,
  Math.max(0.01, Number(process.env.FACE_MIN_CONFIDENCE || 0.6)),
);
const FACE_INPUT_MAX_SIZE = Number(process.env.FACE_INPUT_MAX_SIZE || 640);

let initializationPromise = null;
let initialized = false;

function getInitializationError(error) {
  return new Error(`Face-api.js could not initialize: ${error.message}`);
}

async function initializeFaceRecognition() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const missingModels = REQUIRED_MODEL_FILES.filter(
        (fileName) => !fs.existsSync(path.join(MODEL_DIR, fileName)),
      );

      if (missingModels.length > 0) {
        throw new Error(
          `Missing face-api.js model files in ${MODEL_DIR}: ${missingModels.join(", ")}`,
        );
      }

      await faceapi.tf.setBackend("cpu");
      await faceapi.tf.ready();
      await Promise.all([
        FACE_DETECTOR === "tiny"
          ? faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR)
          : faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR),
        faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR),
        faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR),
      ]);
      initialized = true;
      console.log("[FACE] face-api.js models loaded");
      console.log(`[FACE] TensorFlow backend: ${faceapi.tf.getBackend()}`);
      console.log(`[FACE] Model directory: ${MODEL_DIR}`);
      console.log(`[FACE] Match distance threshold: ${FACE_MATCH_THRESHOLD}`);
      return true;
    } catch (error) {
      initializationPromise = null;
      initialized = false;
      throw getInitializationError(error);
    }
  })();

  return initializationPromise;
}

function ensureInitialized() {
  if (!initialized) throw new Error("Face recognition models are not loaded.");
}

async function imageToTensor(buffer) {
  const image = await imageFromBuffer(buffer);
  const imageData = getImageData(image);
  const { width, height, data } = imageData;
  const rgba = faceapi.tf.tensor3d(
    new Uint8Array(data),
    [height, width, 4],
    "int32",
  );
  const rgb = faceapi.tf.slice(rgba, [0, 0, 0], [height, width, 3]);
  rgba.dispose();

  const scale = Math.min(1, FACE_INPUT_MAX_SIZE / Math.max(width, height));
  if (scale === 1) return rgb;

  const resized = faceapi.tf.image.resizeBilinear(rgb, [
    Math.max(1, Math.round(height * scale)),
    Math.max(1, Math.round(width * scale)),
  ]);
  rgb.dispose();
  return resized;
}

async function detectImage(buffer) {
  ensureInitialized();

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("An image buffer is required.");
  }

  const tensor = await imageToTensor(buffer);

  try {
    const detections = await faceapi
      .detectAllFaces(
        tensor,
        FACE_DETECTOR === "tiny"
          ? new faceapi.TinyFaceDetectorOptions({
              inputSize: FACE_TINY_INPUT_SIZE,
              scoreThreshold: FACE_MIN_CONFIDENCE,
            })
          : new faceapi.SsdMobilenetv1Options({
              minConfidence: FACE_MIN_CONFIDENCE,
            }),
      )
      .withFaceLandmarks()
      .withFaceDescriptors();

    console.log(`[FACE] Faces detected: ${detections.length}`);

    if (detections.length === 0) return { detections, descriptor: null };
    if (detections.length > 1) {
      return { detections, descriptor: null, multipleFaces: true };
    }

    const box = detections[0].detection.box;
    const descriptor = Array.from(detections[0].descriptor);
    console.log(`[FACE] Descriptor generated: ${descriptor.length} dimensions`);
    return {
      detections,
      descriptor,
      faceDimensions: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
    };
  } finally {
    tensor.dispose();
  }
}

function matchEmbedding(descriptor, templates) {
  ensureInitialized();

  const validTemplates = templates.filter(
    (template) =>
      Array.isArray(template.embedding) && template.embedding.length > 0,
  );
  if (!validTemplates.length) return { match: null, best: null };

  const candidateMatches = validTemplates
    .map((template) => ({
      employee_id: Number(template.employee_id),
      distance: faceapi.euclideanDistance(
        new Float32Array(descriptor),
        new Float32Array(template.embedding),
      ),
      model: template.model,
    }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidateMatches[0];
  const distance = Number(best.distance);
  const similarity = Math.max(0, 1 - distance);
  const nextDifferentEmployee = candidateMatches.find(
    (candidate) => candidate.employee_id !== best.employee_id,
  );
  const isAmbiguous = Boolean(
    distance <= FACE_MATCH_THRESHOLD &&
    nextDifferentEmployee &&
    nextDifferentEmployee.distance - best.distance < FACE_MATCH_MARGIN,
  );

  console.log(`[FACE] Candidates: ${validTemplates.length}`);
  console.log(`[FACE] Best match: ${best.employee_id}`);
  console.log(`[FACE] Distance: ${distance}`);
  console.log(`[FACE] Threshold: ${FACE_MATCH_THRESHOLD}`);
  if (nextDifferentEmployee) {
    console.log(
      `[FACE] Next employee distance: ${nextDifferentEmployee.distance}`,
    );
    console.log(
      `[FACE] Match margin: ${nextDifferentEmployee.distance - distance}`,
    );
  }

  if (distance > FACE_MATCH_THRESHOLD || isAmbiguous) {
    console.log(
      `[FACE] Result: ${isAmbiguous ? "AMBIGUOUS" : "NOT_RECOGNIZED"}`,
    );
    return {
      match: null,
      best: {
        employee_id: best.employee_id,
        distance,
        similarity,
        ambiguous: isAmbiguous,
        nextDistance: nextDifferentEmployee?.distance ?? null,
      },
    };
  }

  console.log("[FACE] Result: MATCH");
  return {
    match: {
      employee_id: best.employee_id,
      distance,
      similarity,
      model: best.model || "face-api.js-face-recognition",
    },
    best: { employee_id: best.employee_id, distance, similarity },
  };
}

function getFaceConfiguration() {
  return {
    model: "face-api.js",
    detector: FACE_DETECTOR === "tiny" ? "tinyFaceDetector" : "ssdMobilenetv1",
    descriptor: "faceRecognitionNet",
    landmark: "faceLandmark68Net",
    minConfidence: FACE_MIN_CONFIDENCE,
    inputMaxSize: FACE_INPUT_MAX_SIZE,
    tinyInputSize: FACE_TINY_INPUT_SIZE,
    matchDistanceThreshold: FACE_MATCH_THRESHOLD,
    matchDistanceMargin: FACE_MATCH_MARGIN,
    backend: faceapi.tf.getBackend(),
  };
}

module.exports = {
  FACE_MATCH_THRESHOLD,
  FACE_MIN_CONFIDENCE,
  initializeFaceRecognition,
  detectImage,
  matchEmbedding,
  getFaceConfiguration,
};
