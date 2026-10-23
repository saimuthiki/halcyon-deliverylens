"""Rebuild findings.json from the database (same numbers as analysis/root_cause_analysis.py)."""
from app.analytics.causes import (CAUSES, PROCESS_CAUSES, REALISTIC_EFFECTIVENESS, ROUTING_CAUSES,
                                  VENDOR_BUDGET_USD)
from app.analytics.combos import fair_share
from app.analytics.roi import effectiveness_for_target, fix_costs, scenarios


def compute_findings(ds) -> dict:
    df, model = ds.deliveries, ds.combos
    clients, penalties, complaints, time_study = ds.clients, ds.penalties, ds.complaints, ds.time_study

    base = 1 - df.late.mean()
    clean = df[~df[list(CAUSES)].any(axis=1)]
    shares = fair_share(model)
    costs = fix_costs(ds)

    per_cause = []
    for cause, label in CAUSES.items():
        flagged = df[df[cause]]
        per_cause.append({
            "cause": cause,
            "label": label,
            "deliveries": int(len(flagged)),
            "on_time_rate": round(1 - flagged.late.mean(), 4),
            "share_of_late_deliveries": round(flagged.late.sum() / df.late.sum(), 4),
            "points_gained_if_fixed_alone": round((model.on_time_if_fixed({cause}) - base) * 100, 1),
            "fair_share_points": round(shares[cause] * 100, 1),
            "realistic_effectiveness": REALISTIC_EFFECTIVENESS[cause],
            "fix_cost_per_year_usd": costs[cause],
            "sla_penalties_usd": int(penalties.merge(flagged[["delivery_id"]]).penalty_usd.sum()),
        })

    at_risk = clients[clients.account_status == "threatening_to_leave"]
    at_risk_deliveries = df[df.client_id.isin(at_risk.client_id)]
    return {
        "deliveries": int(len(df)),
        "period": [str(df.order_received_ts.min().date()), str(df.order_received_ts.max().date())],
        "on_time_rate_today": round(base, 4),
        "on_time_rate_with_no_problem": round(1 - clean.late.mean(), 4),
        "deliveries_with_no_problem": int(len(clean)),
        "on_time_if_all_fixed": round(model.on_time_if_fixed(set(CAUSES)), 4),
        "on_time_if_only_routing_fixed": round(model.on_time_if_fixed(ROUTING_CAUSES), 4),
        "on_time_if_only_process_fixed": round(model.on_time_if_fixed(PROCESS_CAUSES), 4),
        "on_time_realistic": round(model.expected(REALISTIC_EFFECTIVENESS), 4),
        "effectiveness_needed_for_94_benchmark": effectiveness_for_target(ds),
        "points_lost_today": round((1 - base) * 100, 1),
        "points_explained_by_the_five_causes": round(sum(shares.values()) * 100, 1),
        "causes": per_cause,
        "scenarios": scenarios(ds, costs),
        "money": {
            "sla_penalties_6_months_usd": int(penalties.penalty_usd.sum()),
            "redelivery_cost_6_months_usd": int(df.redelivery_cost_usd.sum()),
            "at_risk_clients": int(len(at_risk)),
            "at_risk_annual_revenue_usd": int(at_risk.annual_revenue_usd.sum()),
            "at_risk_on_time_rate": round(1 - at_risk_deliveries.late.mean(), 4),
            "others_on_time_rate": round(1 - df[~df.client_id.isin(at_risk.client_id)].late.mean(), 4),
            "routing_vendor_budget_usd": VENDOR_BUDGET_USD,
            "fix_costs_are_estimates": True,
        },
        "complaints": {
            "total": int(len(complaints)),
            "by_category": {k: int(v) for k, v in complaints.category.value_counts().items()},
            "from_at_risk_clients": int(complaints.client_id.isin(at_risk.client_id).sum()),
            "not_told_about_delay": int((complaints.category == "Not told about the delay").sum()),
        },
        "customer_success_week": {
            "hours_total": float(time_study.hours_total.sum()),
            "hours_on_complaints": round(float(time_study.hours_on_delivery_complaints.sum()), 1),
            "hours_keying_email_orders": round(float(time_study.hours_keying_email_orders.sum()), 1),
            "hours_proactive": round(float(time_study.hours_on_proactive_client_work.sum()), 1),
        },
        "data_quality": {
            "missing_actual_route_km": int(df.actual_route_km.isna().sum()),
            "duplicate_order_ids": int(df.order_id.duplicated().sum()),
            "late_deliveries_with_redelivery_cost": int(((df.redelivery_cost_usd > 0) & df.late).sum()),
            "late_deliveries": int(df.late.sum()),
        },
    }
