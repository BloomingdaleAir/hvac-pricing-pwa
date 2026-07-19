import { useEffect, useMemo, useState } from 'react';

type FormState = Record<string, number>;
type PriceOption = { price: number; profit_dollars: number; profit_margin: number };
type Result = {
  labor_cost_per_billable_hour: number;
  overhead_cost_per_billable_hour: number;
  break_even_rate_per_billable_hour: number;
  total_billable_time: number;
  actual_job_cost: number;
  parts_selling_price: number;
  retail: PriceOption;
  discount: PriceOption;
  member: PriceOption;
};

const defaults: FormState = {
  technician_hourly_wage: 50,
  paid_hours_per_year: 2080,
  billable_efficiency: 0.60,
  payroll_burden: 0.30,
  annual_technician_overhead: 60000,
  working_days_per_year: 250,
  average_calls_per_day: 3,
  member_discount: 0.10,
  customer_discount: 0.05,
  travel_time: 0.5,
  diagnostic_time: 0.5,
  repair_time: 1,
  procurement_time: 0,
  parts_cost: 0,
  ancillary_costs: 0,
  distributor_costs: 0,
  parts_margin: 0.40,
  desired_profit_margin: 0.20,
};

const fields = {
  business: [
    ['technician_hourly_wage', 'Technician hourly wage', '$'],
    ['paid_hours_per_year', 'Paid hours per year', 'hours'],
    ['billable_efficiency', 'Billable efficiency', '%'],
    ['payroll_burden', 'Payroll burden', '%'],
    ['annual_technician_overhead', 'Annual technician overhead', '$'],
    ['working_days_per_year', 'Working days per year', 'days'],
    ['average_calls_per_day', 'Average service calls per day', 'calls'],
    ['member_discount', 'Member discount', '%'],
    ['customer_discount', 'Customer discount', '%'],
  ],
  job: [
    ['travel_time', 'Travel time', 'hours'],
    ['diagnostic_time', 'Diagnostic time', 'hours'],
    ['repair_time', 'Estimated repair time', 'hours'],
    ['procurement_time', 'Parts procurement time', 'hours'],
    ['parts_cost', 'Parts cost', '$'],
    ['ancillary_costs', 'Ancillary costs', '$'],
    ['distributor_costs', 'Distributor costs', '$'],
    ['parts_margin', 'Parts markup margin', '%'],
    ['desired_profit_margin', 'Desired profit margin', '%'],
  ],
} as const;

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function calculateOffline(f: FormState): Result {
  const annualWages = f.technician_hourly_wage * f.paid_hours_per_year;
  const totalLabor = annualWages * (1 + f.payroll_burden);
  const billableHours = f.paid_hours_per_year * f.billable_efficiency;
  const laborRate = totalLabor / billableHours;
  const overheadRate = f.annual_technician_overhead / billableHours;
  const breakEven = laborRate + overheadRate;
  const totalTime = f.travel_time + f.diagnostic_time + f.repair_time + f.procurement_time;
  const timeCost = totalTime * breakEven;
  const directCosts = f.parts_cost + f.ancillary_costs + f.distributor_costs;
  const actualJobCost = timeCost + directCosts;
  const partsSellingPrice = f.parts_cost / (1 - f.parts_margin);
  const memberTarget = (timeCost + partsSellingPrice + f.ancillary_costs + f.distributor_costs) / (1 - f.desired_profit_margin);
  const retailPrice = memberTarget / (1 - f.member_discount);
  const discountPrice = retailPrice * (1 - f.customer_discount);
  const memberPrice = retailPrice * (1 - f.member_discount);
  const makeOption = (price: number): PriceOption => ({
    price: Math.round(price * 100) / 100,
    profit_dollars: Math.round((price - actualJobCost) * 100) / 100,
    profit_margin: price > 0 ? (price - actualJobCost) / price : 0,
  });
  return {
    labor_cost_per_billable_hour: laborRate,
    overhead_cost_per_billable_hour: overheadRate,
    break_even_rate_per_billable_hour: breakEven,
    total_billable_time: totalTime,
    actual_job_cost: actualJobCost,
    parts_selling_price: partsSellingPrice,
    retail: makeOption(retailPrice),
    discount: makeOption(discountPrice),
    member: makeOption(memberPrice),
  };
}

function InputRow({ name, label, unit, value, onChange }: {name: string; label: string; unit: string; value: number; onChange: (n: number) => void}) {
  const isPercent = unit === '%';
  return <label className="input-row">
    <span>{label}</span>
    <div className="input-wrap">
      {unit === '$' && <b>$</b>}
      <input
        inputMode="decimal"
        type="number"
        min="0"
        step={isPercent ? '1' : '0.25'}
        value={isPercent ? Number((value * 100).toFixed(2)) : value}
        onChange={e => onChange((Number(e.target.value) || 0) / (isPercent ? 100 : 1))}
      />
      {unit !== '$' && <em>{unit}</em>}
    </div>
  </label>;
}

function PriceCard({ title, option, tone }: { title: string; option: PriceOption; tone: string }) {
  return <section className={`price-card ${tone}`}>
    <h3>{title}</h3>
    <strong>{money.format(option.price)}</strong>
    <footer>
      <span>Profit: {money.format(option.profit_dollars)}</span>
      <span>{pct(option.profit_margin)} margin</span>
    </footer>
  </section>;
}

export default function App() {
  const [form, setForm] = useState<FormState>(() => {
    const saved = localStorage.getItem('hvac-pricing-form');
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<'job' | 'settings'>('job');
  const [status, setStatus] = useState('Ready');

  useEffect(() => { localStorage.setItem('hvac-pricing-form', JSON.stringify(form)); }, [form]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setStatus('Calculating…');
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/calculate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), signal: controller.signal,
        });
        if (!res.ok) throw new Error('Calculation failed');
        setResult(await res.json());
        setStatus('Updated');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setResult(calculateOffline(form)); setStatus('Offline calculation'); }
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form]);

  const activeFields = useMemo(() => fields[tab === 'job' ? 'job' : 'business'], [tab]);
  const setValue = (name: string, value: number) => setForm(current => ({ ...current, [name]: value }));

  return <main>
    <header className="app-header">
      <div><small>FIELD TECHNICIAN TOOL</small><h1>HVAC Service Pricing</h1></div>
      <span className="status">{status}</span>
    </header>

    <nav className="tabs">
      <button className={tab === 'job' ? 'active' : ''} onClick={() => setTab('job')}>Service Call</button>
      <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Business Settings</button>
    </nav>

    <section className="panel">
      <div className="panel-title">
        <h2>{tab === 'job' ? 'Service Call Inputs' : 'Business Assumptions'}</h2>
        {tab === 'job' && <button className="reset" onClick={() => setForm(current => ({...current, travel_time:.5, diagnostic_time:.5, repair_time:1, procurement_time:0, parts_cost:0, ancillary_costs:0, distributor_costs:0}))}>Clear Job</button>}
      </div>
      <div className="form-grid">
        {activeFields.map(([name, label, unit]) => <InputRow key={name} name={name} label={label} unit={unit} value={form[name]} onChange={v => setValue(name, v)} />)}
      </div>
    </section>

    {result && <>
      <section className="metrics">
        <div><span>Break-even rate</span><b>{money.format(result.break_even_rate_per_billable_hour)}/hr</b></div>
        <div><span>Job cost</span><b>{money.format(result.actual_job_cost)}</b></div>
        <div><span>Billable time</span><b>{result.total_billable_time.toFixed(2)} hr</b></div>
        <div><span>Parts selling price</span><b>{money.format(result.parts_selling_price)}</b></div>
      </section>
      <section className="prices">
        <PriceCard title="RETAIL" option={result.retail} tone="retail" />
        <PriceCard title="DISCOUNT" option={result.discount} tone="discount" />
        <PriceCard title="MEMBER" option={result.member} tone="member" />
      </section>
    </>}
  </main>;
}
