from app.routers.recruitment import _resume_download_response


def _payload(content: bytes = b"0123456789"):
    return {
        "content": content,
        "file_name": "candidate.pdf",
        "media_type": "application/pdf",
    }


def test_resume_download_without_range_returns_full_content():
    response = _resume_download_response(_payload())

    assert response.status_code == 200
    assert response.body == b"0123456789"
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == "10"


def test_resume_download_supports_bounded_open_and_suffix_ranges():
    bounded = _resume_download_response(_payload(), "bytes=2-5")
    opened = _resume_download_response(_payload(), "bytes=7-")
    suffix = _resume_download_response(_payload(), "bytes=-3")

    assert bounded.status_code == 206
    assert bounded.body == b"2345"
    assert bounded.headers["content-range"] == "bytes 2-5/10"
    assert opened.body == b"789"
    assert opened.headers["content-range"] == "bytes 7-9/10"
    assert suffix.body == b"789"
    assert suffix.headers["content-range"] == "bytes 7-9/10"


def test_resume_download_rejects_invalid_or_multiple_ranges():
    beyond = _resume_download_response(_payload(), "bytes=20-30")
    multiple = _resume_download_response(_payload(), "bytes=0-1,4-5")

    assert beyond.status_code == 416
    assert beyond.headers["content-range"] == "bytes */10"
    assert multiple.status_code == 416
    assert multiple.headers["content-range"] == "bytes */10"
