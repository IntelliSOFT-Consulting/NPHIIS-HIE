import json
from typing import Dict, Any, Optional
import logging

# Configure a logger for the module
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class LocationProcessor:
    @staticmethod
    def get_parent_location(
        location_id: str, locations_dict: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Get parent location from location dictionary using location ID
        """
        if not location_id or not locations_dict:
            return {}

        location = locations_dict.get(location_id, {})
        if not location:
            return {}

        try:

            part_of = location.get("partOf", "{}")
            reference = json.loads(part_of).get("reference", "")

            print("reference", reference)
            if reference:
                parent_id = reference.replace("Location/", "")
                return locations_dict.get(parent_id, {})
            return {}
        except KeyError as e:
            logger.error(
                f"Key error when accessing location data for {location_id}: {e}"
            )
            return {}
        except Exception as e:
            logger.error(f"Error getting parent location for {location_id}: {e}")
            return {}

    @staticmethod
    def get_location_hierarchy(
        facility_code: str, locations_dict: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Optional[str]]:
        """
        Get complete location hierarchy (ward, subcounty, county) for a facility
        Returns a dictionary with location details
        """
        hierarchy = {
            "ward": "N/A",
            "ward_id": None,
            "subcounty": "N/A",
            "subcounty_id": None,
            "county": "N/A",
            "county_id": None,
        }

        try:
            if not facility_code or not locations_dict:
                return hierarchy

            # Get facility location
            facility = locations_dict.get(facility_code, {})
            if not facility:
                return hierarchy

            # Get ward (parent of facility)
            ward = LocationProcessor.get_parent_location(facility_code, locations_dict)
            # print("facility", facility)
            # print("ward", ward)
            if ward:
                hierarchy.update(
                    {"ward": ward.get("name", "N/A"), "ward_id": ward.get("id")}
                )

                # Get subcounty (parent of ward)
                subcounty = LocationProcessor.get_parent_location(
                    ward.get("id"), locations_dict
                )
                if subcounty:
                    hierarchy.update(
                        {
                            "subcounty": subcounty.get("name", "N/A"),
                            "subcounty_id": subcounty.get("id"),
                        }
                    )

                    # Get county (parent of subcounty)
                    county = LocationProcessor.get_parent_location(
                        subcounty.get("id"), locations_dict
                    )
                    if county:
                        hierarchy.update(
                            {
                                "county": county.get("name", "N/A"),
                                "county_id": county.get("id"),
                            }
                        )

            return hierarchy

        except KeyError as e:
            logger.error(
                f"Key error when accessing location data for facility {facility_code}: {e}"
            )
            return hierarchy
        except Exception as e:
            logger.error(
                f"Error getting location hierarchy for facility {facility_code}: {e}"
            )
            return hierarchy

    @staticmethod
    def process_location_names(
        locations_dict: Dict[str, Dict[str, Any]]
    ) -> Dict[str, str]:
        """
        Process location dictionary to create a mapping of IDs to names
        """
        location_names = {}
        try:
            for loc_id, location in locations_dict.items():
                if location.get("name"):
                    location_names[loc_id] = location["name"]
            return location_names
        except KeyError as e:
            logger.error(f"Key error when processing location names: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error processing location names: {e}")
            return {}
