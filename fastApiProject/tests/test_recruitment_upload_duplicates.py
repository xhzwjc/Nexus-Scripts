from app.routers.recruitment import _filter_uploaded_resume_rows


def test_skipped_duplicate_rows_are_not_treated_as_uploaded():
    rows = [
        {"id": 1, "name": "existing", "skipped_duplicate": True},
        {"id": 2, "name": "created"},
        {"id": 3, "name": "overwritten", "overwritten": True},
    ]

    uploaded_rows = _filter_uploaded_resume_rows(rows)

    assert [row["id"] for row in uploaded_rows] == [2, 3]
