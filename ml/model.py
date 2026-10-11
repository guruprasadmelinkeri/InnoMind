
import json
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Any


class MediroutePredictor:
    """
    CPU-only predictor for MediRoute resource forecasting.

    Loads trained release and availability ensembles, engineers features,
    aligns input columns, calibrates probabilities, and reports ensemble
    disagreement.
    """

    def __init__(
        self,
        release_model_path: str = "release_model.joblib",
        availability_model_path: str = "availability_model.joblib",
    ):
        print(
            f"Loading models from: {release_model_path} "
            f"and {availability_model_path}..."
        )

        self.release_bundle = joblib.load(release_model_path)
        self.availability_bundle = joblib.load(availability_model_path)

        # Keep inference on CPU for every XGBoost estimator.
        self._configure_cpu(self.release_bundle)
        self._configure_cpu(self.availability_bundle)

        self.expected_features = self.release_bundle["feature_columns"]
        self.categorical_features = self.release_bundle["categorical_features"]

        print("Models loaded successfully!")
        print("Inference device: CPU")

    @staticmethod
    def _configure_cpu(bundle: Dict[str, Any]) -> None:
        """Configure XGBoost ensemble members for CPU inference."""
        for model in bundle["ensemble"]:
            if hasattr(model, "get_xgb_params") and hasattr(model, "set_params"):
                model.set_params(device="cpu")

    def _engineer_features(
        self, raw_input: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Calculate the additional features expected by the models."""
        engineered = raw_input.copy()

        engineered["release_to_admission_ratio_60m"] = (
            (engineered["releases_last_60m"] + 1)
            / (engineered["admissions_last_60m"] + 1)
        )

        engineered["release_acceleration_30m_vs_120m"] = (
            engineered["releases_last_30m"]
            - engineered["releases_last_120m"] / 4.0
        )

        engineered["effective_capacity_ratio"] = (
            (engineered["current_occupied"] + engineered["current_reserved"])
            / (engineered["capacity"] + 1e-5)
        )

        return engineered

    def _preprocess(self, raw_input: Dict[str, Any]) -> pd.DataFrame:
        """Encode categorical features and align trained feature columns."""
        processed_dict = self._engineer_features(raw_input)
        df = pd.DataFrame([processed_dict])

        df_encoded = pd.get_dummies(
            df,
            columns=self.categorical_features,
            dtype=float,
        )

        return df_encoded.reindex(
            columns=self.expected_features,
            fill_value=0.0,
        )

    @staticmethod
    def _predict_with_bundle(
        X: pd.DataFrame,
        bundle: Dict[str, Any],
    ) -> Dict[str, float]:
        """Predict calibrated probability and ensemble disagreement."""
        ensemble = bundle["ensemble"]
        calibrator = bundle["calibrator"]

        member_probs = np.stack(
            [model.predict_proba(X)[:, 1] for model in ensemble]
        )

        raw_mean = member_probs.mean(axis=0)

        # Convert mean probability to log-odds for calibration.
        p_clip = np.clip(raw_mean, 1e-6, 1 - 1e-6)
        logit = np.log(p_clip / (1 - p_clip)).reshape(-1, 1)

        calibrated_prob = float(calibrator.predict_proba(logit)[0, 1])
        disagreement_std = float(member_probs.std(axis=0)[0])

        return {
            "probability": round(calibrated_prob, 4),
            "disagreement_std": round(disagreement_std, 4),
        }

    def predict(self, telemetry_data: Dict[str, Any]) -> Dict[str, Any]:
        """Predict release and availability probabilities."""
        X_processed = self._preprocess(telemetry_data)

        release_output = self._predict_with_bundle(
            X_processed, self.release_bundle
        )

        availability_output = self._predict_with_bundle(
            X_processed, self.availability_bundle
        )

        return {
            "hospital_id": telemetry_data.get("hospital_id"),
            "resource_type": telemetry_data.get("resource_type"),
            "horizon_minutes": telemetry_data.get("horizon_minutes"),
            "patient_eta_minutes": telemetry_data.get(
                "patient_eta_minutes"
            ),
            "release_prediction": release_output,
            "availability_prediction": availability_output,
        }

    @staticmethod
    def _predict_many_with_bundle(
        X: pd.DataFrame,
        bundle: Dict[str, Any],
    ) -> list[Dict[str, float]]:
        """Predict a batch together to avoid one model call per hospital."""
        member_probs = np.stack(
            [model.predict_proba(X)[:, 1] for model in bundle["ensemble"]]
        )
        raw_mean = member_probs.mean(axis=0)
        p_clip = np.clip(raw_mean, 1e-6, 1 - 1e-6)
        logits = np.log(p_clip / (1 - p_clip)).reshape(-1, 1)
        calibrated = bundle["calibrator"].predict_proba(logits)[:, 1]
        disagreement = member_probs.std(axis=0)
        return [
            {"probability": round(float(prob), 4), "disagreement_std": round(float(std), 4)}
            for prob, std in zip(calibrated, disagreement)
        ]

    def predict_many(self, telemetry_rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        """Return predictions for multiple hospitals in one vectorized pass."""
        if not telemetry_rows:
            return []
        engineered = [self._engineer_features(row) for row in telemetry_rows]
        frame = pd.DataFrame(engineered)
        X = pd.get_dummies(
            frame, columns=self.categorical_features, dtype=float
        ).reindex(columns=self.expected_features, fill_value=0.0)
        releases = self._predict_many_with_bundle(X, self.release_bundle)
        availability = self._predict_many_with_bundle(X, self.availability_bundle)
        return [
            {
                "hospital_id": row.get("hospital_id"),
                "resource_type": row.get("resource_type"),
                "horizon_minutes": row.get("horizon_minutes"),
                "patient_eta_minutes": row.get("patient_eta_minutes"),
                "release_prediction": release,
                "availability_prediction": available,
            }
            for row, release, available in zip(telemetry_rows, releases, availability)
        ]


if __name__ == "__main__":
    predictor = MediroutePredictor(
        release_model_path="release_model.joblib",
        availability_model_path="availability_model.joblib",
    )

    realtime_input = {
        "hospital_id": "H08",
        "resource_type": "icu_bed",
        "hour_of_day": 19,
        "hospital_demand_factor": 1.2,
        "capacity": 10,
        "current_free": 1,
        "current_occupied": 9,
        "current_reserved": 0,
        "current_closed": 0,
        "occupancy_ratio": 0.9,
        "mean_occupied_duration_min": 480.0,
        "max_occupied_duration_min": 960.0,
        "releases_last_30m": 1,
        "releases_last_60m": 1,
        "releases_last_120m": 3,
        "admissions_last_30m": 0,
        "admissions_last_60m": 1,
        "admissions_last_120m": 2,
        "net_occupancy_change_last_60m": 0,
        "data_age_seconds": 0,
        "patient_eta_minutes": 45,
        "horizon_minutes": 60,
    }

    prediction_result = predictor.predict(realtime_input)

    print("\n--- PREDICTION OUTPUT ---")
    print(json.dumps(prediction_result, indent=2))
