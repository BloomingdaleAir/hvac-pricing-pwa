from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="HVAC Service Pricing API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PricingRequest(BaseModel):
    technician_hourly_wage: float = Field(50, ge=0)
    paid_hours_per_year: float = Field(2080, gt=0)
    billable_efficiency: float = Field(0.60, gt=0, le=1)
    payroll_burden: float = Field(0.30, ge=0, lt=1)
    annual_technician_overhead: float = Field(60000, ge=0)
    working_days_per_year: float = Field(250, gt=0)
    average_calls_per_day: float = Field(3, gt=0)
    member_discount: float = Field(0.10, ge=0, lt=1)
    customer_discount: float = Field(0.05, ge=0, lt=1)

    travel_time: float = Field(0.5, ge=0)
    diagnostic_time: float = Field(0.5, ge=0)
    repair_time: float = Field(1.0, ge=0)
    procurement_time: float = Field(0, ge=0)
    parts_cost: float = Field(0, ge=0)
    ancillary_costs: float = Field(0, ge=0)
    distributor_costs: float = Field(0, ge=0)
    parts_margin: float = Field(0.40, ge=0, lt=1)
    desired_profit_margin: float = Field(0.20, ge=0, lt=1)

    @model_validator(mode="after")
    def validate_margins(self) -> "PricingRequest":
        if self.member_discount >= 1 or self.parts_margin >= 1 or self.desired_profit_margin >= 1:
            raise ValueError("Margins and discounts must be less than 100%")
        return self


class PriceOption(BaseModel):
    price: float
    profit_dollars: float
    profit_margin: float


class PricingResponse(BaseModel):
    annual_wages: float
    annual_payroll_burden: float
    total_annual_labor_cost: float
    billable_hours_per_year: float
    labor_cost_per_billable_hour: float
    overhead_cost_per_billable_hour: float
    break_even_rate_per_billable_hour: float
    estimated_calls_per_year: float
    average_overhead_per_call: float
    total_billable_time: float
    time_based_break_even_cost: float
    actual_direct_costs: float
    actual_job_cost: float
    parts_selling_price: float
    target_member_price: float
    retail: PriceOption
    discount: PriceOption
    member: PriceOption


def round_money(value: float) -> float:
    return round(value + 1e-9, 2)


def option(price: float, actual_job_cost: float) -> PriceOption:
    profit = price - actual_job_cost
    margin = profit / price if price > 0 else 0
    return PriceOption(
        price=round_money(price),
        profit_dollars=round_money(profit),
        profit_margin=round(margin, 4),
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/calculate", response_model=PricingResponse)
def calculate(data: PricingRequest) -> PricingResponse:
    annual_wages = data.technician_hourly_wage * data.paid_hours_per_year
    annual_payroll_burden = annual_wages * data.payroll_burden
    total_annual_labor_cost = annual_wages + annual_payroll_burden
    billable_hours = data.paid_hours_per_year * data.billable_efficiency
    labor_rate = total_annual_labor_cost / billable_hours
    overhead_rate = data.annual_technician_overhead / billable_hours
    break_even_rate = labor_rate + overhead_rate

    estimated_calls = data.working_days_per_year * data.average_calls_per_day
    average_overhead_per_call = data.annual_technician_overhead / estimated_calls

    total_time = data.travel_time + data.diagnostic_time + data.repair_time + data.procurement_time
    time_cost = total_time * break_even_rate
    actual_direct_costs = data.parts_cost + data.ancillary_costs + data.distributor_costs
    actual_job_cost = time_cost + actual_direct_costs

    parts_selling_price = data.parts_cost / (1 - data.parts_margin)
    priced_subtotal = time_cost + parts_selling_price + data.ancillary_costs + data.distributor_costs
    target_member_price = priced_subtotal / (1 - data.desired_profit_margin)
    retail_price = target_member_price / (1 - data.member_discount)
    discount_price = retail_price * (1 - data.customer_discount)
    member_price = retail_price * (1 - data.member_discount)

    return PricingResponse(
        annual_wages=round_money(annual_wages),
        annual_payroll_burden=round_money(annual_payroll_burden),
        total_annual_labor_cost=round_money(total_annual_labor_cost),
        billable_hours_per_year=round(billable_hours, 2),
        labor_cost_per_billable_hour=round_money(labor_rate),
        overhead_cost_per_billable_hour=round_money(overhead_rate),
        break_even_rate_per_billable_hour=round_money(break_even_rate),
        estimated_calls_per_year=round(estimated_calls, 2),
        average_overhead_per_call=round_money(average_overhead_per_call),
        total_billable_time=round(total_time, 2),
        time_based_break_even_cost=round_money(time_cost),
        actual_direct_costs=round_money(actual_direct_costs),
        actual_job_cost=round_money(actual_job_cost),
        parts_selling_price=round_money(parts_selling_price),
        target_member_price=round_money(target_member_price),
        retail=option(retail_price, actual_job_cost),
        discount=option(discount_price, actual_job_cost),
        member=option(member_price, actual_job_cost),
    )
