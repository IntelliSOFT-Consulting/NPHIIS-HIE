def to_dict(data):
    return [row.__dict__ for row in data]


def to_json(data):
    results_dict = to_dict(data)
    for result in results_dict:
        result.pop("_sa_instance_state")
    return results_dict