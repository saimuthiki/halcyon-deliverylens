"""Assessment of the $680K routing-optimisation contract leadership is about to sign."""
from app.analytics.causes import PROCESS_CAUSES, ROUTING_CAUSES

RECOMMENDATION = ("Do not sign as scoped; reshape: fix address capture, same-day cutoff and stock "
                  "placement first; run a smaller carrier-lane + route pilot")


def vendor_assessment(ds) -> dict:
    f = ds.findings
    today = f["on_time_rate_today"]
    routing, process, all_fixed = (f["on_time_if_only_routing_fixed"], f["on_time_if_only_process_fixed"],
                                   f["on_time_if_all_fixed"])
    by_cause = {c["cause"]: c for c in f["causes"]}
    routing_points = round((routing - today) * 100, 1)
    process_points = round((process - today) * 100, 1)
    return {
        "verdict": "do_not_sign_as_scoped",
        "today": today,
        "routing_only_ceiling": routing,
        "process_only": process,
        "all_fixed": all_fixed,
        "routing_only_points": routing_points,
        "process_only_points": process_points,
        "routing_share_of_late": round(sum(by_cause[c]["share_of_late_deliveries"] for c in ROUTING_CAUSES), 4),
        "process_causes": sorted(PROCESS_CAUSES),
        "routing_causes": sorted(ROUTING_CAUSES),
        "budget_usd": f["money"]["routing_vendor_budget_usd"],
        "at_risk_revenue_usd": f["money"]["at_risk_annual_revenue_usd"],
        "at_risk_clients": f["money"]["at_risk_clients"],
        "recommendation": RECOMMENDATION,
        "reasons": [
            f"Even a perfect routing product only lifts on-time delivery from {today:.1%} to {routing:.1%} "
            f"(+{routing_points} points).",
            f"Fixing the three process causes alone reaches {process:.1%} (+{process_points} points).",
            f"Fixing all five causes reaches {all_fixed:.1%}, the rate of deliveries with no problem today.",
            f"${f['money']['at_risk_annual_revenue_usd']:,} of annual revenue sits with "
            f"{f['money']['at_risk_clients']} clients threatening to leave; the ${f['money']['routing_vendor_budget_usd']:,} "
            "budget should go where the points are.",
        ],
    }
