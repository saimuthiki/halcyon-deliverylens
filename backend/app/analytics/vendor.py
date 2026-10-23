"""Assessment of the $680K routing-optimisation contract leadership is about to sign."""
from app.analytics.causes import PROCESS_CAUSES, ROUTING_CAUSES

RECOMMENDATION = ("Do not sign as scoped; reshape: fix address capture, same-day cutoff and stock "
                  "placement first; move the 7 weak carrier lanes by rule (no software needed); run a small "
                  "route-deviation pilot before committing the budget")


def vendor_assessment(ds) -> dict:
    f = ds.findings
    today = f["on_time_rate_today"]
    routing, process, realistic, all_fixed = (f["on_time_if_only_routing_fixed"], f["on_time_if_only_process_fixed"],
                                              f["on_time_realistic"], f["on_time_if_all_fixed"])
    by_cause = {c["cause"]: c for c in f["causes"]}
    routing_points = round((routing - today) * 100, 1)
    process_points = round((process - today) * 100, 1)
    vendor_points = by_cause["route_deviation"]["fair_share_points"]
    carrier_points = by_cause["weak_carrier_lane"]["fair_share_points"]
    carrier_cost = by_cause["weak_carrier_lane"]["fix_cost_per_year_usd"]
    budget = f["money"]["routing_vendor_budget_usd"]
    return {
        "verdict": "do_not_sign_as_scoped",
        "today": today,
        "routing_only_ceiling": routing,
        "process_only": process,
        "realistic_all_five": realistic,
        "all_fixed": all_fixed,
        "routing_only_points": routing_points,
        "process_only_points": process_points,
        "vendor_unique_points": vendor_points,
        "carrier_lane_points": carrier_points,
        "carrier_lane_cost_per_year_usd": carrier_cost,
        "routing_share_of_late": round(sum(by_cause[c]["share_of_late_deliveries"] for c in ROUTING_CAUSES), 4),
        "process_causes": sorted(PROCESS_CAUSES),
        "routing_causes": sorted(ROUTING_CAUSES),
        "budget_usd": budget,
        "at_risk_revenue_usd": f["money"]["at_risk_annual_revenue_usd"],
        "at_risk_clients": f["money"]["at_risk_clients"],
        "recommendation": RECOMMENDATION,
        "reasons": [
            f"Even a perfect routing product only lifts on-time delivery from {today:.1%} to {routing:.1%} "
            f"(+{routing_points} points), and that ceiling includes moving the weak carrier lanes.",
            f"Moving the 7 weak carrier lanes (+{carrier_points} points fair share) is a carrier-allocation rule "
            f"that needs no software; it costs about ${carrier_cost:,} a year in higher carrier rates.",
            f"The vendor's own unique contribution is route deviation: about {vendor_points} points.",
            f"Fixing the three process causes alone reaches {process:.1%} (+{process_points} points).",
            f"All five fixes with realistic effectiveness reach {realistic:.1%}; the ceiling with every fix fully "
            f"adopted is {all_fixed:.1%}.",
            f"${f['money']['at_risk_annual_revenue_usd']:,} of annual revenue sits with "
            f"{f['money']['at_risk_clients']} clients threatening to leave; the ${budget:,} "
            "budget should go where the points are.",
        ],
    }
