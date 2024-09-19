from models.dataset import PrimaryImmunizationDataset
from datetime import datetime
from sqlalchemy import func, and_, cast, Date, or_
from configs import db
from typing import Dict, List, Optional

def calculate_dropout_rate(value1: int, value2: int) -> float:
    if value1 == 0:
        return 0
    dropout = value1 - value2
    return (dropout / value1) * 100

def monitoring_report(county: Optional[str] = None, subcounty: Optional[str] = None, facility: Optional[str] = None, year: Optional[int] = None) -> List[Dict]:
    report_year = year or datetime.now().year

    vaccines = ["IMDPT-1", "IMDPT-3", "IMMEAS-0"]

    query = db.session.query(
        PrimaryImmunizationDataset.vaccine_code,
        func.date_part('month', cast(PrimaryImmunizationDataset.occ_date, Date)).label('month'),
        func.count().label('count')
    )

    filters = [
        cast(PrimaryImmunizationDataset.occ_date, Date).between(f'{report_year}-01-01', f'{report_year}-12-31'),
        PrimaryImmunizationDataset.vaccine_code.in_(vaccines)
    ]

    if county:
        filters.append(PrimaryImmunizationDataset.county == county)
    elif subcounty:
        filters.append(PrimaryImmunizationDataset.subcounty == subcounty)
    elif facility:
        filters.append(PrimaryImmunizationDataset.facility_code == facility)

    query = query.filter(and_(*filters))

    query = query.group_by(
        PrimaryImmunizationDataset.vaccine_code,
        func.date_part('month', cast(PrimaryImmunizationDataset.occ_date, Date))
    ).order_by(
        PrimaryImmunizationDataset.vaccine_code,
        func.date_part('month', cast(PrimaryImmunizationDataset.occ_date, Date))
    )

    results = query.all()

    monthly_data = {month: {vaccine: 0 for vaccine in vaccines} for month in range(1, 13)}
    
    # Process the query results
    for row in results:
        vaccine_code = row.vaccine_code
        month = int(row.month)
        count = row.count
        
        monthly_data[month][vaccine_code] = count

    # Generate the final report
    final_results = []
    cumulative_data = {vaccine: 0 for vaccine in vaccines}

    for month in range(1, 13):
        month_data = {
            'month': datetime(report_year, month, 1).strftime('%B'),
            'year': report_year
        }
        
        for vaccine in vaccines:
            monthly_count = monthly_data[month][vaccine]
            cumulative_data[vaccine] += monthly_count
            month_data[f'{vaccine}_monthly'] = monthly_count
            month_data[f'{vaccine}_cumulative'] = cumulative_data[vaccine]

        # Calculate monthly dropout rates
        month_data['DO_IMDPT1_IMDPT3_monthly'] = monthly_data[month]['IMDPT-1'] - monthly_data[month]['IMDPT-3']
        month_data['DO%_IMDPT1_IMDPT3_monthly'] = calculate_dropout_rate(monthly_data[month]['IMDPT-1'], monthly_data[month]['IMDPT-3'])
        month_data['DO_IMDPT1_IMMEAS0_monthly'] = monthly_data[month]['IMDPT-1'] - monthly_data[month]['IMMEAS-0']
        month_data['DO%_IMDPT1_IMMEAS0_monthly'] = calculate_dropout_rate(monthly_data[month]['IMDPT-1'], monthly_data[month]['IMMEAS-0'])

        # Calculate cumulative dropout rates
        month_data['DO_IMDPT1_IMDPT3_cumulative'] = cumulative_data['IMDPT-1'] - cumulative_data['IMDPT-3']
        month_data['DO%_IMDPT1_IMDPT3_cumulative'] = calculate_dropout_rate(cumulative_data['IMDPT-1'], cumulative_data['IMDPT-3'])
        month_data['DO_IMDPT1_IMMEAS0_cumulative'] = cumulative_data['IMDPT-1'] - cumulative_data['IMMEAS-0']
        month_data['DO%_IMDPT1_IMMEAS0_cumulative'] = calculate_dropout_rate(cumulative_data['IMDPT-1'], cumulative_data['IMMEAS-0'])
        
        final_results.append(month_data)
    
    return final_results