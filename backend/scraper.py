import requests
from bs4 import BeautifulSoup
from datetime import datetime

LOGIN_URL = "https://www.nrcmec.org/Student/login.php"
ATTENDANCE_URL = "https://www.nrcmec.org/Student/Date_wise_attendance"


def get_attendance(roll_no, password):
    """
    Logs into the NRCM student portal and scrapes full semester attendance.
    Returns a dict with semester_summary, monthly_summary, and date_wise_attendance.
    Raises Exception on login failure or scraping error.
    """

    # --- LOGIN ---
    session = requests.Session()
    response = session.get(LOGIN_URL)
    soup = BeautifulSoup(response.text, "html.parser")

    payload = {"roll_no": roll_no, "password": password}
    form = soup.find("form")
    if form:
        for hidden in form.find_all("input", type="hidden"):
            payload[hidden.get("name")] = hidden.get("value", "")

    login_response = session.post(LOGIN_URL, data=payload)

    if "index.php" not in login_response.url:
        raise Exception("Invalid credentials. Please check your roll number and password.")

    # --- FETCH ATTENDANCE PAGE ---
    att_response = session.get(ATTENDANCE_URL)
    if "login" in att_response.url:
        raise Exception("Session did not persist after login.")

    att_soup = BeautifulSoup(att_response.text, "html.parser")

    # --- PARSE ALL MONTH TABS ---
    tab_content = att_soup.find("div", id="monthTabsContent")
    if not tab_content:
        raise Exception("Could not find attendance tab content on the page.")

    tab_panes = tab_content.find_all("div", class_="tab-pane")
    if not tab_panes:
        raise Exception("No monthly tab panels found.")

    all_date_wise = []

    for pane in tab_panes:
        month_id = pane.get("id", "Unknown")
        table = pane.find("table")
        if not table:
            continue

        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        periods = [h for h in headers if h != "Date"]
        rows = table.find_all("tr")[1:]  # skip header row

        for row in rows:
            cols = row.find_all("td")
            if not cols:
                continue
            date_text = cols[0].get_text(separator=" ", strip=True)
            record = {
                "date": date_text,
                "month": month_id,
                "periods": {}
            }
            for i, period in enumerate(periods):
                if i + 1 < len(cols):
                    val = cols[i + 1].get_text(strip=True)
                    record["periods"][period] = val if val else "-"
            all_date_wise.append(record)

    # Sort all days chronologically across months
    def parse_date(d):
        try:
            return datetime.strptime(d["date"].split()[0], "%d-%m-%Y")
        except:
            return datetime.min

    all_date_wise.sort(key=parse_date)

    # --- PARSE MONTHLY SUMMARY TABLE ---
    monthly_summary = []
    for table in att_soup.find_all("table"):
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if "Month" in headers and "Classes Attended" in headers:
            for row in table.find_all("tr")[1:]:
                cols = row.find_all("td")
                if len(cols) >= 4:
                    monthly_summary.append({
                        "month": cols[0].get_text(strip=True),
                        "classes_attended": cols[1].get_text(strip=True),
                        "total_classes": cols[2].get_text(strip=True),
                        "percentage": cols[3].get_text(strip=True),
                    })
            break

    # --- PARSE SEMESTER SUMMARY ---
    semester_summary = {}
    lines = [l.strip() for l in att_soup.get_text(separator="\n").splitlines() if l.strip()]
    for i, line in enumerate(lines):
        if "Total Present" in line and i + 1 < len(lines):
            semester_summary["total_present"] = lines[i + 1]
        if "Total Classes" in line and i + 1 < len(lines):
            semester_summary["total_classes"] = lines[i + 1]
        if "Overall Percentage" in line and i + 1 < len(lines):
            semester_summary["overall_percentage"] = lines[i + 1]

    return {
        "student_roll": roll_no,
        "semester_summary": semester_summary,
        "monthly_summary": monthly_summary,
        "date_wise_attendance": all_date_wise,
    }


# --- QUICK TEST (only runs when you execute this file directly) ---
if __name__ == "__main__":
    import json
    roll = input("Enter Roll Number: ")
    pwd = input("Enter Password: ")
    try:
        data = get_attendance(roll, pwd)
        print("\n✅ Scraping successful")
        print(f"   Total Days Scraped : {len(data['date_wise_attendance'])}")
        print(f"   Months Found       : {len(set(d['month'] for d in data['date_wise_attendance']))}")
        print(f"   Total Present      : {data['semester_summary'].get('total_present')}")
        print(f"   Total Classes      : {data['semester_summary'].get('total_classes')}")
        print(f"   Overall %          : {data['semester_summary'].get('overall_percentage')}")
        print("\n📅 Monthly Breakdown:")
        for m in data["monthly_summary"]:
            print(f"   {m['month']}: {m['classes_attended']}/{m['total_classes']} = {m['percentage']}")
        with open("attendance_data.json", "w") as f:
            json.dump(data, f, indent=2)
        print("\n✅ Saved to attendance_data.json")
    except Exception as e:
        print(f"\n❌ Error: {e}")