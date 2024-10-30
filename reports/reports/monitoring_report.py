from models.dataset import PrimaryImmunizationDataset
from datetime import datetime
from sqlalchemy import func, and_, cast, Date, or_
from configs import db
from typing import Dict, List, Optional


def calculate_dropout_rate(value1: int, value2: int) -> float:
    """Calculate dropout rate between two values"""
    if value1 == 0:
        return 0
    dropout = value1 - value2
    return (dropout / value1) * 100


def monitoring_report(
    county: Optional[str] = None,
    subcounty: Optional[str] = None,
    facility: Optional[str] = None,
    year: Optional[int] = None
) -> List[Dict]:
    """Generate monitoring report with dropout rates"""
    try:
        report_year = year or datetime.now().year

        # Updated vaccine codes to match new model
        vaccines = ["14676", "50732", "24014"]  # DPT-1, DPT-3, Measles-1
        vaccine_names = {
            "14676": "DPT-HepB+Hib 1",
            "50732": "DPT-HepB+Hib 3",
            "24014": "Measles-Rubella 1"
        }

        query = db.session.query(
            PrimaryImmunizationDataset.vaccine_code,
            PrimaryImmunizationDataset.vaccine_name,
            func.date_part('month', cast(PrimaryImmunizationDataset.administered_date, Date)).label('month'),
            func.count().label('count')
        ).filter(
            PrimaryImmunizationDataset.immunization_status == 'completed'  # Only count completed immunizations
        )

        filters = [
            cast(PrimaryImmunizationDataset.administered_date, Date).between(
                f'{report_year}-01-01', f'{report_year}-12-31'
            ),
            PrimaryImmunizationDataset.vaccine_code.in_(vaccines),
            PrimaryImmunizationDataset.is_active == True,
            PrimaryImmunizationDataset.is_deceased == False
        ]

        if county:
            filters.append(PrimaryImmunizationDataset.county.ilike(f"%{county}%"))
        elif subcounty:
            filters.append(PrimaryImmunizationDataset.subcounty.ilike(f"%{subcounty}%"))
        elif facility:
            filters.append(PrimaryImmunizationDataset.facility_code == facility)

        query = query.filter(and_(*filters))

        query = query.group_by(
            PrimaryImmunizationDataset.vaccine_code,
            PrimaryImmunizationDataset.vaccine_name,
            func.date_part('month', cast(PrimaryImmunizationDataset.administered_date, Date))
        ).order_by(
            PrimaryImmunizationDataset.vaccine_code,
            func.date_part('month', cast(PrimaryImmunizationDataset.administered_date, Date))
        )

        results = query.all()

        # Initialize monthly data
        monthly_data = {month: {vaccine: 0 for vaccine in vaccines} for month in range(1, 13)}
        
        # Process query results
        for row in results:
            vaccine_code = row.vaccine_code
            month = int(row.month)
            count = row.count
            
            if month in monthly_data and vaccine_code in vaccines:
                monthly_data[month][vaccine_code] = count

        # Generate final report
        final_results = []
        cumulative_data = {vaccine: 0 for vaccine in vaccines}

        for month in range(1, 13):
            month_data = {
                'month': datetime(report_year, month, 1).strftime('%B'),
                'year': report_year
            }
            
            # Monthly counts
            for vaccine in vaccines:
                monthly_count = monthly_data[month][vaccine]
                cumulative_data[vaccine] += monthly_count
                month_data[f'{vaccine_names[vaccine]}_monthly'] = monthly_count
                month_data[f'{vaccine_names[vaccine]}_cumulative'] = cumulative_data[vaccine]

            # Calculate monthly dropout rates
            dpt1_monthly = monthly_data[month]['14676']  # DPT1
            dpt3_monthly = monthly_data[month]['50732']  # DPT3
            measles_monthly = monthly_data[month]['24014']  # Measles

            month_data.update({
                'DPT_dropout_monthly': dpt1_monthly - dpt3_monthly,
                'DPT_dropout_rate_monthly': round(calculate_dropout_rate(dpt1_monthly, dpt3_monthly), 2),
                'Measles_dropout_monthly': dpt1_monthly - measles_monthly,
                'Measles_dropout_rate_monthly': round(calculate_dropout_rate(dpt1_monthly, measles_monthly), 2),
            })

            # Calculate cumulative dropout rates
            dpt1_cumulative = cumulative_data['14676']
            dpt3_cumulative = cumulative_data['50732']
            measles_cumulative = cumulative_data['24014']

            month_data.update({
                'DPT_dropout_cumulative': dpt1_cumulative - dpt3_cumulative,
                'DPT_dropout_rate_cumulative': round(calculate_dropout_rate(dpt1_cumulative, dpt3_cumulative), 2),
                'Measles_dropout_cumulative': dpt1_cumulative - measles_cumulative,
                'Measles_dropout_rate_cumulative': round(calculate_dropout_rate(dpt1_cumulative, measles_cumulative), 2),
            })

            # Add performance indicators
            month_data.update({
                'DPT_performance_status': 'Good' if month_data['DPT_dropout_rate_cumulative'] < 10 else 'Poor',
                'Measles_performance_status': 'Good' if month_data['Measles_dropout_rate_cumulative'] < 10 else 'Poor'
            })
            
            final_results.append(month_data)

        return {
            'metadata': {
                'report_year': report_year,
                'county': county,
                'subcounty': subcounty,
                'facility': facility,
                'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            },
            'data': final_results
        }

    except Exception as e:
        db.session.rollback()
        raise Exception(f"Error generating monitoring report: {str(e)}")