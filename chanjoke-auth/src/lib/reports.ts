// import hive from 'hive-driver';
import { thrift, HiveClient, connections, auth } from 'hive-driver';
const { TCLIService, TCLIService_types } = thrift;

const client = new HiveClient(TCLIService, TCLIService_types);
const connectionString = process.env.HIVE_DATASOURCE_CONNECTION_STRING ?? '';
let connectionParams = connectionString.split("hive://hive@")[1].split(":");

let getHiveConnection = async () => {
    return (await client.connect({host: connectionParams[0], port: parseInt(connectionParams[1])}, 
    new connections.TcpConnection(), new auth.NoSaslAuthentication()))
};

let queryMOH710 = `
    SELECT Q1.county, Q2.facility_code, Q2.faci_outr, Q2.imm_vaccine, Q1.age_group, Q2.occ_date, COUNT(*) AS cases_count
    FROM
    ( SELECT county, sub_county, the_state, id as patient_id, family_name, given_name, phone, gender, birthDate, DATEDIFF(year, birthDate, CURRENT_DATE) as age_y, DATEDIFF(month, birthDate, CURRENT_DATE) as age_m, CASE WHEN DATEDIFF(month, birthDate, CURRENT_DATE) <= 12 THEN 'Under 1 Year' ELSE 'Above 1 Year' END AS age_group
    FROM
        Patient
        LATERAL VIEW explode(name.family) AS family_name LATERAL VIEW explode(name.given[0]) AS given_name LATERAL VIEW explode(telecom.value) AS phone LATERAL VIEW explode(address.city) AS county LATERAL VIEW explode(address.district) AS sub_county LATERAL VIEW explode(address.state) AS the_state
    ) AS Q1
    LEFT JOIN
    (
    SELECT id AS immunization_id, exploded_facility.locationid AS facility_code, exploded_faci_outr.text[1] AS faci_outr, patient_id, encounter_id, CAST(LEFT(exploded_dateTime, 10) AS DATE) AS occ_date, CAST(LEFT(exploded_lastdate, 10) AS DATE) AS lastUpdated_date, exploded_code.display AS imm_vaccine, exploded_dose.value AS dose_qty, exploded_protocol[0].text[0] AS the_protocol
    FROM Immunization
        LATERAL VIEW explode(array(patient.patientId)) AS patient_id LATERAL VIEW explode(vaccineCode.coding) AS exploded_code LATERAL VIEW explode(array(occurrence.dateTime)) AS exploded_dateTime LATERAL VIEW explode(array(meta.lastUpdated)) AS exploded_lastdate LATERAL VIEW explode(array(encounter.encounterId)) AS encounter_id LATERAL VIEW explode(array(doseQuantity)) AS exploded_dose LATERAL VIEW explode(array(protocolApplied.targetDisease)) AS exploded_protocol LATERAL VIEW explode(array(location)) AS exploded_facility LATERAL VIEW explode(array(note)) AS exploded_faci_outr
    ) AS Q2
    ON Q1.patient_id = Q2.patient_id
    WHERE Q2.occ_date IS NOT NULL AND Q2.facility_code IS NOT NULL
    GROUP BY Q1.county, Q2.facility_code, Q2.faci_outr, Q2.imm_vaccine, Q1.age_group, Q2.occ_date
    ORDER BY Q1.county, Q2.imm_vaccine, Q2.occ_date;
    ` ;

export let computeMOH710 = async () => {
    try {
        let connection = await getHiveConnection();
        console.log(Object.keys(connection))
        let session = await connection.openSession({ client_protocol: TCLIService_types.TProtocolVersion.HIVE_CLI_SERVICE_PROTOCOL_V10 });
        console.log("Session", session);
        // let response = (await session.executeStatement(queryMOH710)).fetch();
        // console.log(response);
        // return response;
    } catch (error) {
        console.log(error)
        return null;
    }
}

// computeMOH710();