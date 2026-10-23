/* eslint-disable */
// GENERATED from analysis/output/findings.json and data/halcyon-dataset (2026-10-23).
// Static snapshot used when the API is unreachable. Do not edit by hand.
import type { AtRiskClient, CarrierScorecard, DeliverySummary, MonthlyPoint, CauseKey } from './types';

export const FINDINGS = {
  "deliveries": 48340,
  "period": [
    "2026-04-01",
    "2026-09-25"
  ],
  "on_time_rate_today": 0.71,
  "on_time_rate_with_no_problem": 0.9663,
  "deliveries_with_no_problem": 24380,
  "on_time_if_all_fixed": 0.9663,
  "on_time_if_only_routing_fixed": 0.7862,
  "on_time_if_only_process_fixed": 0.8672,
  "causes": [
    {
      "cause": "incomplete_address",
      "label": "Address incomplete when the order came in",
      "deliveries": 5994,
      "on_time_rate": 0.354,
      "share_of_late_deliveries": 0.2762,
      "points_gained_if_fixed_alone": 6.0,
      "fair_share_points": 6.8,
      "sla_penalties_usd": 287280
    },
    {
      "cause": "same_day_after_cutoff",
      "label": "Same-day order received after the 08:00 pick-list cutoff",
      "deliveries": 4826,
      "on_time_rate": 0.39,
      "share_of_late_deliveries": 0.21,
      "points_gained_if_fixed_alone": 4.6,
      "fair_share_points": 5.3,
      "sla_penalties_usd": 171900
    },
    {
      "cause": "stock_not_at_nearest",
      "label": "Nearest warehouse had no stock, shipped from further away",
      "deliveries": 6009,
      "on_time_rate": 0.4999,
      "share_of_late_deliveries": 0.2144,
      "points_gained_if_fixed_alone": 4.0,
      "fair_share_points": 4.8,
      "sla_penalties_usd": 184500
    },
    {
      "cause": "weak_carrier_lane",
      "label": "Carrier is weak in that destination region",
      "deliveries": 7895,
      "on_time_rate": 0.5415,
      "share_of_late_deliveries": 0.2582,
      "points_gained_if_fixed_alone": 4.8,
      "fair_share_points": 5.7,
      "sla_penalties_usd": 213120
    },
    {
      "cause": "route_deviation",
      "label": "Driver went more than 20% beyond the planned route",
      "deliveries": 2880,
      "on_time_rate": 0.3736,
      "share_of_late_deliveries": 0.1287,
      "points_gained_if_fixed_alone": 2.6,
      "fair_share_points": 3.0,
      "sla_penalties_usd": 102960
    }
  ],
  "money": {
    "sla_penalties_6_months_usd": 872460,
    "redelivery_cost_6_months_usd": 476646,
    "at_risk_clients": 9,
    "at_risk_annual_revenue_usd": 14200000,
    "at_risk_on_time_rate": 0.707,
    "routing_vendor_budget_usd": 680000
  },
  "complaints": {
    "total": 34,
    "by_category": {
      "Delivery late": 14,
      "Not told about the delay": 12,
      "Redelivery needed": 6,
      "Penalty dispute": 2
    },
    "from_at_risk_clients": 24
  },
  "customer_success_week": {
    "hours_total": 720.0,
    "hours_on_complaints": 460.8,
    "hours_keying_email_orders": 44.4,
    "hours_proactive": 179.5
  },
  "data_quality": {
    "missing_actual_route_km": 1339,
    "duplicate_order_ids": 21,
    "late_deliveries_with_redelivery_cost": 14019,
    "late_deliveries": 14019
  }
} ;

export const MONTHLY: MonthlyPoint[] = [
  {
    "month": "2026-04",
    "deliveries": 8252,
    "late": 2428,
    "on_time_rate": 0.7058,
    "penalties_usd": 154440
  },
  {
    "month": "2026-05",
    "deliveries": 8296,
    "late": 2463,
    "on_time_rate": 0.7031,
    "penalties_usd": 154260
  },
  {
    "month": "2026-06",
    "deliveries": 8108,
    "late": 2315,
    "on_time_rate": 0.7145,
    "penalties_usd": 144180
  },
  {
    "month": "2026-07",
    "deliveries": 8643,
    "late": 2498,
    "on_time_rate": 0.711,
    "penalties_usd": 149580
  },
  {
    "month": "2026-08",
    "deliveries": 7948,
    "late": 2268,
    "on_time_rate": 0.7146,
    "penalties_usd": 144000
  },
  {
    "month": "2026-09",
    "deliveries": 7093,
    "late": 2047,
    "on_time_rate": 0.7114,
    "penalties_usd": 126000
  }
];

export const SCORECARD: CarrierScorecard = {
  "carriers": [
    {
      "carrier_id": "A",
      "carrier_name": "Carrier A",
      "deliveries": 10650,
      "on_time_rate": 0.7523,
      "avg_days_late": 2.82,
      "has_api": true,
      "event_feed": "API",
      "preferred_supplier": false,
      "base_rate_usd": 14.0,
      "weak_regions": []
    },
    {
      "carrier_id": "B",
      "carrier_name": "Carrier B",
      "deliveries": 9762,
      "on_time_rate": 0.7532,
      "avg_days_late": 2.78,
      "has_api": true,
      "event_feed": "API",
      "preferred_supplier": false,
      "base_rate_usd": 13.5,
      "weak_regions": []
    },
    {
      "carrier_id": "C",
      "carrier_name": "Carrier C",
      "deliveries": 6745,
      "on_time_rate": 0.7526,
      "avg_days_late": 2.8,
      "has_api": true,
      "event_feed": "API",
      "preferred_supplier": false,
      "base_rate_usd": 15.0,
      "weak_regions": []
    },
    {
      "carrier_id": "D",
      "carrier_name": "Carrier D",
      "deliveries": 8928,
      "on_time_rate": 0.6052,
      "avg_days_late": 2.95,
      "has_api": false,
      "event_feed": "Portal only",
      "preferred_supplier": false,
      "base_rate_usd": 11.5,
      "weak_regions": [
        "Midwest",
        "Southeast"
      ]
    },
    {
      "carrier_id": "E",
      "carrier_name": "Carrier E",
      "deliveries": 5334,
      "on_time_rate": 0.7002,
      "avg_days_late": 2.85,
      "has_api": false,
      "event_feed": "Batch file",
      "preferred_supplier": false,
      "base_rate_usd": 12.0,
      "weak_regions": [
        "West"
      ]
    },
    {
      "carrier_id": "F",
      "carrier_name": "Carrier F",
      "deliveries": 6921,
      "on_time_rate": 0.6852,
      "avg_days_late": 2.91,
      "has_api": false,
      "event_feed": "Batch file",
      "preferred_supplier": true,
      "base_rate_usd": 10.5,
      "weak_regions": [
        "Northeast",
        "Southeast"
      ]
    }
  ],
  "matrix": [
    {
      "carrier_id": "A",
      "region": "Midwest",
      "deliveries": 2938,
      "on_time_rate": 0.7502,
      "weak": false
    },
    {
      "carrier_id": "A",
      "region": "Northeast",
      "deliveries": 2698,
      "on_time_rate": 0.7617,
      "weak": false
    },
    {
      "carrier_id": "A",
      "region": "Southeast",
      "deliveries": 2920,
      "on_time_rate": 0.7527,
      "weak": false
    },
    {
      "carrier_id": "A",
      "region": "West",
      "deliveries": 2094,
      "on_time_rate": 0.7426,
      "weak": false
    },
    {
      "carrier_id": "B",
      "region": "Midwest",
      "deliveries": 2769,
      "on_time_rate": 0.7458,
      "weak": false
    },
    {
      "carrier_id": "B",
      "region": "Northeast",
      "deliveries": 2564,
      "on_time_rate": 0.7399,
      "weak": false
    },
    {
      "carrier_id": "B",
      "region": "Southeast",
      "deliveries": 2550,
      "on_time_rate": 0.7616,
      "weak": false
    },
    {
      "carrier_id": "B",
      "region": "West",
      "deliveries": 1879,
      "on_time_rate": 0.7712,
      "weak": false
    },
    {
      "carrier_id": "C",
      "region": "Midwest",
      "deliveries": 1939,
      "on_time_rate": 0.7633,
      "weak": false
    },
    {
      "carrier_id": "C",
      "region": "Northeast",
      "deliveries": 1721,
      "on_time_rate": 0.7589,
      "weak": false
    },
    {
      "carrier_id": "C",
      "region": "Southeast",
      "deliveries": 1775,
      "on_time_rate": 0.7408,
      "weak": false
    },
    {
      "carrier_id": "C",
      "region": "West",
      "deliveries": 1310,
      "on_time_rate": 0.7443,
      "weak": false
    },
    {
      "carrier_id": "D",
      "region": "Midwest",
      "deliveries": 2798,
      "on_time_rate": 0.5343,
      "weak": true
    },
    {
      "carrier_id": "D",
      "region": "Northeast",
      "deliveries": 2670,
      "on_time_rate": 0.6648,
      "weak": false
    },
    {
      "carrier_id": "D",
      "region": "Southeast",
      "deliveries": 1401,
      "on_time_rate": 0.5446,
      "weak": true
    },
    {
      "carrier_id": "D",
      "region": "West",
      "deliveries": 2059,
      "on_time_rate": 0.6654,
      "weak": false
    },
    {
      "carrier_id": "E",
      "region": "Midwest",
      "deliveries": 1347,
      "on_time_rate": 0.7513,
      "weak": false
    },
    {
      "carrier_id": "E",
      "region": "Northeast",
      "deliveries": 1352,
      "on_time_rate": 0.7714,
      "weak": false
    },
    {
      "carrier_id": "E",
      "region": "Southeast",
      "deliveries": 1265,
      "on_time_rate": 0.7439,
      "weak": false
    },
    {
      "carrier_id": "E",
      "region": "West",
      "deliveries": 1370,
      "on_time_rate": 0.5394,
      "weak": true
    },
    {
      "carrier_id": "F",
      "region": "Midwest",
      "deliveries": 2708,
      "on_time_rate": 0.7526,
      "weak": false
    },
    {
      "carrier_id": "F",
      "region": "Northeast",
      "deliveries": 1663,
      "on_time_rate": 0.5568,
      "weak": true
    },
    {
      "carrier_id": "F",
      "region": "Southeast",
      "deliveries": 663,
      "on_time_rate": 0.5309,
      "weak": true
    },
    {
      "carrier_id": "F",
      "region": "West",
      "deliveries": 1887,
      "on_time_rate": 0.7557,
      "weak": false
    }
  ],
  "recommendations": [
    {
      "region": "Midwest",
      "recommended_carrier": "C",
      "on_time_rate": 0.7633,
      "avoid_carrier": "D",
      "avoid_on_time_rate": 0.5343
    },
    {
      "region": "Northeast",
      "recommended_carrier": "E",
      "on_time_rate": 0.7714,
      "avoid_carrier": "F",
      "avoid_on_time_rate": 0.5568
    },
    {
      "region": "Southeast",
      "recommended_carrier": "B",
      "on_time_rate": 0.7616,
      "avoid_carrier": "F",
      "avoid_on_time_rate": 0.5309
    },
    {
      "region": "West",
      "recommended_carrier": "B",
      "on_time_rate": 0.7712,
      "avoid_carrier": "E",
      "avoid_on_time_rate": 0.5394
    }
  ]
};

export const AT_RISK_CLIENTS: AtRiskClient[] = [
  {
    "client_id": "C263",
    "client_name": "Client 263",
    "region": "Midwest",
    "tier": "Tier 1",
    "channel": "Email",
    "annual_revenue_usd": 2250000,
    "deliveries": 747,
    "on_time_rate": 0.7416,
    "penalties_usd": 23220,
    "main_causes": [
      "incomplete_address",
      "weak_carrier_lane"
    ]
  },
  {
    "client_id": "C049",
    "client_name": "Client 049",
    "region": "Midwest",
    "tier": "Tier 1",
    "channel": "EDI",
    "annual_revenue_usd": 2130000,
    "deliveries": 737,
    "on_time_rate": 0.711,
    "penalties_usd": 25380,
    "main_causes": [
      "weak_carrier_lane",
      "stock_not_at_nearest"
    ]
  },
  {
    "client_id": "C099",
    "client_name": "Client 099",
    "region": "West",
    "tier": "Tier 1",
    "channel": "API",
    "annual_revenue_usd": 2000000,
    "deliveries": 1065,
    "on_time_rate": 0.6958,
    "penalties_usd": 42300,
    "main_causes": [
      "weak_carrier_lane",
      "same_day_after_cutoff"
    ]
  },
  {
    "client_id": "C077",
    "client_name": "Client 077",
    "region": "Northeast",
    "tier": "Tier 1",
    "channel": "EDI",
    "annual_revenue_usd": 1800000,
    "deliveries": 740,
    "on_time_rate": 0.7297,
    "penalties_usd": 24840,
    "main_causes": [
      "weak_carrier_lane",
      "stock_not_at_nearest"
    ]
  },
  {
    "client_id": "C033",
    "client_name": "Client 033",
    "region": "Southeast",
    "tier": "Tier 1",
    "channel": "API",
    "annual_revenue_usd": 1650000,
    "deliveries": 771,
    "on_time_rate": 0.7147,
    "penalties_usd": 0,
    "main_causes": [
      "weak_carrier_lane",
      "same_day_after_cutoff"
    ]
  },
  {
    "client_id": "C111",
    "client_name": "Client 111",
    "region": "Southeast",
    "tier": "Tier 1",
    "channel": "API",
    "annual_revenue_usd": 1420000,
    "deliveries": 929,
    "on_time_rate": 0.6975,
    "penalties_usd": 36720,
    "main_causes": [
      "weak_carrier_lane",
      "same_day_after_cutoff"
    ]
  },
  {
    "client_id": "C190",
    "client_name": "Client 190",
    "region": "Southeast",
    "tier": "Tier 1",
    "channel": "Email",
    "annual_revenue_usd": 1250000,
    "deliveries": 2978,
    "on_time_rate": 0.7005,
    "penalties_usd": 115560,
    "main_causes": [
      "incomplete_address",
      "weak_carrier_lane"
    ]
  },
  {
    "client_id": "C022",
    "client_name": "Client 022",
    "region": "Midwest",
    "tier": "Tier 2",
    "channel": "API",
    "annual_revenue_usd": 920000,
    "deliveries": 590,
    "on_time_rate": 0.7017,
    "penalties_usd": 23220,
    "main_causes": [
      "same_day_after_cutoff",
      "weak_carrier_lane"
    ]
  },
  {
    "client_id": "C055",
    "client_name": "Client 055",
    "region": "Northeast",
    "tier": "Tier 2",
    "channel": "Email",
    "annual_revenue_usd": 780000,
    "deliveries": 990,
    "on_time_rate": 0.699,
    "penalties_usd": 38700,
    "main_causes": [
      "incomplete_address",
      "weak_carrier_lane"
    ]
  }
];

export const SAMPLE_DELIVERIES: Record<CauseKey, DeliverySummary[]> = {
  "incomplete_address": [
    {
      "delivery_id": "D000009",
      "client_id": "C168",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 00:39",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-09",
      "days_late": 4,
      "destination_region": "Southeast",
      "carrier_id": "B",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 14:43",
      "distance_miles": 79,
      "planned_route_km": 94.3,
      "actual_route_km": 97.5,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    },
    {
      "delivery_id": "D000010",
      "client_id": "C100",
      "order_channel": "EDI",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 00:47",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-10",
      "days_late": 5,
      "destination_region": "Midwest",
      "carrier_id": "C",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W1",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 13:29",
      "distance_miles": 107,
      "planned_route_km": 223.7,
      "actual_route_km": 234.1,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    },
    {
      "delivery_id": "D000032",
      "client_id": "C084",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 02:04",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "Northeast",
      "carrier_id": "C",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:13",
      "distance_miles": 59,
      "planned_route_km": 214.6,
      "actual_route_km": null,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    },
    {
      "delivery_id": "D000036",
      "client_id": "C033",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 02:16",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-09",
      "days_late": 4,
      "destination_region": "Midwest",
      "carrier_id": "C",
      "nearest_warehouse_id": "W2",
      "fulfilment_warehouse_id": "W2",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:33",
      "distance_miles": 191,
      "planned_route_km": 199.0,
      "actual_route_km": 216.0,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    },
    {
      "delivery_id": "D000054",
      "client_id": "C099",
      "order_channel": "EDI",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 04:14",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-08",
      "days_late": 3,
      "destination_region": "Midwest",
      "carrier_id": "C",
      "nearest_warehouse_id": "W2",
      "fulfilment_warehouse_id": "W2",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 15:34",
      "distance_miles": 147,
      "planned_route_km": 87.2,
      "actual_route_km": 93.9,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    },
    {
      "delivery_id": "D000084",
      "client_id": "C227",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 06:23",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-04",
      "days_late": 2,
      "destination_region": "Southeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 14:49",
      "distance_miles": 123,
      "planned_route_km": 109.2,
      "actual_route_km": 115.4,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address",
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000089",
      "client_id": "C101",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 06:41",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-07",
      "days_late": 5,
      "destination_region": "Northeast",
      "carrier_id": "B",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 14:03",
      "distance_miles": 67,
      "planned_route_km": 46.3,
      "actual_route_km": 47.7,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    },
    {
      "delivery_id": "D000110",
      "client_id": "C192",
      "order_channel": "EDI",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 07:46",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-08",
      "days_late": 3,
      "destination_region": "Northeast",
      "carrier_id": "E",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 11:42",
      "distance_miles": 102,
      "planned_route_km": 219.0,
      "actual_route_km": 241.4,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address"
      ]
    }
  ],
  "same_day_after_cutoff": [
    {
      "delivery_id": "D000121",
      "client_id": "C192",
      "order_channel": "EDI",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:05",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-03",
      "days_late": 1,
      "destination_region": "Northeast",
      "carrier_id": "A",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 16:56",
      "distance_miles": 96,
      "planned_route_km": 72.4,
      "actual_route_km": 77.1,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "same_day_after_cutoff"
      ]
    },
    {
      "delivery_id": "D000130",
      "client_id": "C088",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:23",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-03",
      "days_late": 1,
      "destination_region": "Northeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 10:00",
      "distance_miles": 105,
      "planned_route_km": 138.9,
      "actual_route_km": 142.2,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "same_day_after_cutoff"
      ]
    },
    {
      "delivery_id": "D000131",
      "client_id": "C130",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:24",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-03",
      "days_late": 1,
      "destination_region": "Northeast",
      "carrier_id": "E",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 16:39",
      "distance_miles": 93,
      "planned_route_km": 284.1,
      "actual_route_km": 328.2,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "same_day_after_cutoff"
      ]
    },
    {
      "delivery_id": "D000132",
      "client_id": "C086",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:24",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-04",
      "days_late": 2,
      "destination_region": "Northeast",
      "carrier_id": "F",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 15:28",
      "distance_miles": 49,
      "planned_route_km": 97.2,
      "actual_route_km": 109.9,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "same_day_after_cutoff",
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000136",
      "client_id": "C048",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:31",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-04",
      "days_late": 2,
      "destination_region": "Southeast",
      "carrier_id": "C",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "complete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 13:49",
      "distance_miles": 62,
      "planned_route_km": 202.9,
      "actual_route_km": 231.8,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "same_day_after_cutoff"
      ]
    },
    {
      "delivery_id": "D000139",
      "client_id": "C061",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:37",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-03",
      "days_late": 1,
      "destination_region": "Midwest",
      "carrier_id": "A",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W1",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 10:48",
      "distance_miles": 155,
      "planned_route_km": 152.7,
      "actual_route_km": 171.3,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address",
        "same_day_after_cutoff"
      ]
    },
    {
      "delivery_id": "D000145",
      "client_id": "C130",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:49",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-03",
      "days_late": 1,
      "destination_region": "West",
      "carrier_id": "D",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W5",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 12:07",
      "distance_miles": 190,
      "planned_route_km": 226.2,
      "actual_route_km": 246.7,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address",
        "same_day_after_cutoff"
      ]
    },
    {
      "delivery_id": "D000150",
      "client_id": "C108",
      "order_channel": "EDI",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 08:53",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-04",
      "days_late": 2,
      "destination_region": "West",
      "carrier_id": "B",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W5",
      "address_status": "complete",
      "pick_list_date": "2026-04-02",
      "shipped_ts": "2026-04-02 14:49",
      "distance_miles": 144,
      "planned_route_km": 168.5,
      "actual_route_km": 180.6,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "same_day_after_cutoff"
      ]
    }
  ],
  "stock_not_at_nearest": [
    {
      "delivery_id": "D000002",
      "client_id": "C053",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 00:00",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-06",
      "days_late": 4,
      "destination_region": "Southeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:03",
      "distance_miles": 823,
      "planned_route_km": 176.4,
      "actual_route_km": 189.5,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest",
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000014",
      "client_id": "C217",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 01:01",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-07",
      "days_late": 5,
      "destination_region": "West",
      "carrier_id": "C",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 14:52",
      "distance_miles": 2436,
      "planned_route_km": 115.8,
      "actual_route_km": 127.0,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest"
      ]
    },
    {
      "delivery_id": "D000017",
      "client_id": "C102",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 01:06",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-07",
      "days_late": 2,
      "destination_region": "Midwest",
      "carrier_id": "F",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 10:10",
      "distance_miles": 707,
      "planned_route_km": 184.1,
      "actual_route_km": 188.8,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest"
      ]
    },
    {
      "delivery_id": "D000023",
      "client_id": "C047",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 01:25",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-07",
      "days_late": 5,
      "destination_region": "Midwest",
      "carrier_id": "B",
      "nearest_warehouse_id": "W2",
      "fulfilment_warehouse_id": "W5",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:09",
      "distance_miles": 1373,
      "planned_route_km": 150.1,
      "actual_route_km": 230.5,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest",
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000031",
      "client_id": "C219",
      "order_channel": "API",
      "commitment_type": "next_day",
      "order_received_ts": "2026-04-01 02:02",
      "promised_date": "2026-04-03",
      "delivered_date": "2026-04-07",
      "days_late": 4,
      "destination_region": "Midwest",
      "carrier_id": "F",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W3",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 15:47",
      "distance_miles": 661,
      "planned_route_km": 102.7,
      "actual_route_km": 105.6,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest"
      ]
    },
    {
      "delivery_id": "D000034",
      "client_id": "C173",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 02:06",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "Northeast",
      "carrier_id": "A",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W2",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 10:52",
      "distance_miles": 659,
      "planned_route_km": 127.2,
      "actual_route_km": 146.3,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest"
      ]
    },
    {
      "delivery_id": "D000040",
      "client_id": "C264",
      "order_channel": "EDI",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 02:34",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-07",
      "days_late": 2,
      "destination_region": "West",
      "carrier_id": "A",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W2",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 10:42",
      "distance_miles": 1368,
      "planned_route_km": 72.9,
      "actual_route_km": 84.7,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest"
      ]
    },
    {
      "delivery_id": "D000055",
      "client_id": "C049",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 04:20",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "Southeast",
      "carrier_id": "B",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W1",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:37",
      "distance_miles": 762,
      "planned_route_km": 161.1,
      "actual_route_km": 164.0,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest"
      ]
    }
  ],
  "weak_carrier_lane": [
    {
      "delivery_id": "D000002",
      "client_id": "C053",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 00:00",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-06",
      "days_late": 4,
      "destination_region": "Southeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:03",
      "distance_miles": 823,
      "planned_route_km": 176.4,
      "actual_route_km": 189.5,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest",
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000018",
      "client_id": "C070",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 01:07",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-08",
      "days_late": 3,
      "destination_region": "Northeast",
      "carrier_id": "F",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 15:21",
      "distance_miles": 116,
      "planned_route_km": 214.0,
      "actual_route_km": 231.0,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000057",
      "client_id": "C077",
      "order_channel": "EDI",
      "commitment_type": "next_day",
      "order_received_ts": "2026-04-01 04:34",
      "promised_date": "2026-04-03",
      "delivered_date": "2026-04-06",
      "days_late": 3,
      "destination_region": "Southeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 12:29",
      "distance_miles": 121,
      "planned_route_km": 82.1,
      "actual_route_km": 86.0,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000061",
      "client_id": "C049",
      "order_channel": "EDI",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 04:48",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-07",
      "days_late": 2,
      "destination_region": "Southeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 13:14",
      "distance_miles": 161,
      "planned_route_km": 173.8,
      "actual_route_km": 201.6,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000079",
      "client_id": "C011",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 06:13",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-07",
      "days_late": 2,
      "destination_region": "Southeast",
      "carrier_id": "F",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 10:23",
      "distance_miles": 157,
      "planned_route_km": 95.8,
      "actual_route_km": 103.4,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000084",
      "client_id": "C227",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 06:23",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-04",
      "days_late": 2,
      "destination_region": "Southeast",
      "carrier_id": "D",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "incomplete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 14:49",
      "distance_miles": 123,
      "planned_route_km": 109.2,
      "actual_route_km": 115.4,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "incomplete_address",
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000087",
      "client_id": "C053",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 06:31",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-04",
      "days_late": 2,
      "destination_region": "Midwest",
      "carrier_id": "D",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W1",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 14:05",
      "distance_miles": 144,
      "planned_route_km": 80.1,
      "actual_route_km": 84.7,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "weak_carrier_lane"
      ]
    },
    {
      "delivery_id": "D000092",
      "client_id": "C172",
      "order_channel": "EDI",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 06:53",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "Midwest",
      "carrier_id": "D",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W1",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:06",
      "distance_miles": 113,
      "planned_route_km": 133.7,
      "actual_route_km": 142.2,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "weak_carrier_lane"
      ]
    }
  ],
  "route_deviation": [
    {
      "delivery_id": "D000004",
      "client_id": "C127",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 00:18",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "West",
      "carrier_id": "B",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W5",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 15:15",
      "distance_miles": 95,
      "planned_route_km": 167.6,
      "actual_route_km": 210.3,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000023",
      "client_id": "C047",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 01:25",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-07",
      "days_late": 5,
      "destination_region": "Midwest",
      "carrier_id": "B",
      "nearest_warehouse_id": "W2",
      "fulfilment_warehouse_id": "W5",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:09",
      "distance_miles": 1373,
      "planned_route_km": 150.1,
      "actual_route_km": 230.5,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "stock_not_at_nearest",
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000049",
      "client_id": "C142",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 03:58",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "West",
      "carrier_id": "D",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W5",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 15:40",
      "distance_miles": 170,
      "planned_route_km": 77.6,
      "actual_route_km": 115.8,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000056",
      "client_id": "C031",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 04:26",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-08",
      "days_late": 3,
      "destination_region": "Southeast",
      "carrier_id": "B",
      "nearest_warehouse_id": "W3",
      "fulfilment_warehouse_id": "W3",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 13:30",
      "distance_miles": 145,
      "planned_route_km": 114.6,
      "actual_route_km": 162.6,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000078",
      "client_id": "C254",
      "order_channel": "API",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 06:07",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-05",
      "days_late": 3,
      "destination_region": "Northeast",
      "carrier_id": "B",
      "nearest_warehouse_id": "W4",
      "fulfilment_warehouse_id": "W4",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 10:03",
      "distance_miles": 85,
      "planned_route_km": 108.4,
      "actual_route_km": 178.8,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000083",
      "client_id": "C221",
      "order_channel": "EDI",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 06:21",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-08",
      "days_late": 3,
      "destination_region": "West",
      "carrier_id": "C",
      "nearest_warehouse_id": "W5",
      "fulfilment_warehouse_id": "W5",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 13:10",
      "distance_miles": 187,
      "planned_route_km": 55.6,
      "actual_route_km": 83.2,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000106",
      "client_id": "C024",
      "order_channel": "API",
      "commitment_type": "standard",
      "order_received_ts": "2026-04-01 07:30",
      "promised_date": "2026-04-05",
      "delivered_date": "2026-04-06",
      "days_late": 1,
      "destination_region": "Midwest",
      "carrier_id": "A",
      "nearest_warehouse_id": "W1",
      "fulfilment_warehouse_id": "W1",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 16:02",
      "distance_miles": 109,
      "planned_route_km": 252.1,
      "actual_route_km": 395.3,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    },
    {
      "delivery_id": "D000114",
      "client_id": "C032",
      "order_channel": "Email",
      "commitment_type": "same_day",
      "order_received_ts": "2026-04-01 07:55",
      "promised_date": "2026-04-02",
      "delivered_date": "2026-04-03",
      "days_late": 1,
      "destination_region": "Midwest",
      "carrier_id": "A",
      "nearest_warehouse_id": "W2",
      "fulfilment_warehouse_id": "W2",
      "address_status": "complete",
      "pick_list_date": "2026-04-01",
      "shipped_ts": "2026-04-01 12:31",
      "distance_miles": 256,
      "planned_route_km": 224.7,
      "actual_route_km": 367.6,
      "redelivery_cost_usd": 34.0,
      "causes": [
        "route_deviation"
      ]
    }
  ]
};
