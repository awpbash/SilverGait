"""
Deterministic scoring and classification functions.
No LLM calls — pure rule-based logic used by the Assessment Graph.
"""

CFS_LABELS = {
    1: "Very Fit",
    2: "Well",
    3: "Managing Well",
    4: "Vulnerable",
    5: "Mildly Frail",
    6: "Moderately Frail",
    7: "Severely Frail",
    8: "Very Severely Frail",
    9: "Terminally Ill",
}


def score_katz(answers: dict[str, bool]) -> int:
    """Katz ADL score: count of independent activities (0-6). Higher = more independent."""
    return sum(1 for v in answers.values() if v)


def score_cfs(katz_total: int, age: int | None = None) -> int:
    """Clinical Frailty Scale estimate from Katz + age (1-9).
    1=very fit, 9=terminally ill."""
    if katz_total >= 6:
        return 2  # well
    if katz_total >= 5:
        return 3  # managing well
    if katz_total >= 4:
        return 4  # vulnerable
    if katz_total >= 3:
        return 5  # mildly frail
    if katz_total >= 2:
        return 6  # moderately frail
    if katz_total >= 1:
        return 7  # severely frail
    return 8  # very severely frail


def score_sppb(balance: int, gait: int, chair: int) -> int:
    """SPPB total from sub-scores (0-12). Higher = better."""
    return balance + gait + chair


def classify_frailty(
    cfs: int, katz: int, sppb: int | None = None
) -> tuple[str, str]:
    """Returns (tier, risk_explanation). Pure rule-based."""
    reasons = []

    # Primary classification from CFS
    if cfs >= 7 or (katz <= 2 and sppb is not None and sppb <= 3):
        tier = "severely_frail"
    elif cfs >= 5 or (katz <= 4 and sppb is not None and sppb <= 6):
        tier = "frail"
    elif cfs >= 4 or (sppb is not None and sppb <= 9):
        tier = "pre_frail"
    else:
        tier = "robust"

    # Build human-readable explanation
    cfs_label = CFS_LABELS.get(cfs, "Unknown")
    reasons.append(f"CFS {cfs}/9 ({cfs_label})")
    reasons.append(f"Katz ADL {katz}/6")
    if sppb is not None:
        reasons.append(f"SPPB {sppb}/12")

    tier_labels = {
        "robust": "robust (good functional status)",
        "pre_frail": "pre-frail (some vulnerability detected)",
        "frail": "frail (significant functional decline)",
        "severely_frail": "severely frail (high care needs)",
    }
    explanation = (
        f"Based on your scores ({', '.join(reasons)}), "
        f"you are classified as {tier_labels[tier]}."
    )

    return tier, explanation


def route_care(tier: str, risks: dict[str, str]) -> list[str]:
    """Determine which care pathways to activate.
    Returns list of plan types: ['exercise', 'sleep', ...]"""
    pathways = ["exercise"]  # always active
    if risks.get("sleep_risk") in ("moderate", "high"):
        pathways.append("sleep")
    if tier in ("frail", "severely_frail"):
        pathways.extend(["education", "monitoring"])
    if risks.get("mood_risk") == "high":
        pathways.append("education")
    # Deduplicate while preserving order
    return list(dict.fromkeys(pathways))


def generate_narrative(
    tier: str,
    cfs: int,
    katz: int,
    sppb: int | None,
    balance: int | None = None,
    gait: int | None = None,
    chair: int | None = None,
) -> str:
    """Generate human-readable risk explanation from scores. Templated, no LLM."""
    parts = []

    tier_descriptions = {
        "robust": "Your overall health is good. Keep up your daily activities and exercises to maintain your strength.",
        "pre_frail": "You show some signs of vulnerability. Targeted exercises can help you stay strong and prevent decline.",
        "frail": "You have some areas that need attention. A tailored care plan will help you stay safe and improve.",
        "severely_frail": "You need extra support right now. Gentle exercises and caregiver help are important for your wellbeing.",
    }
    parts.append(tier_descriptions.get(tier, ""))

    if sppb is not None and balance is not None and gait is not None and chair is not None:
        deficit_notes = []
        if balance <= 1:
            deficit_notes.append("balance needs the most work")
        if gait <= 1:
            deficit_notes.append("walking speed can be improved")
        if chair <= 1:
            deficit_notes.append("leg strength needs strengthening")
        if deficit_notes:
            parts.append(f"Specifically, {', '.join(deficit_notes)}.")

    return " ".join(parts)
