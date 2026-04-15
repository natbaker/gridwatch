from dataclasses import dataclass


@dataclass(frozen=True)
class Circuit:
    name: str
    city: str
    country: str
    flag_emoji: str
    latitude: float
    longitude: float
    timezone: str


CIRCUITS: dict[str, Circuit] = {
    "albert_park": Circuit("Albert Park", "Melbourne", "Australia", "🇦🇺", -37.8497, 144.968, "Australia/Melbourne"),
    "shanghai": Circuit("Shanghai International Circuit", "Shanghai", "China", "🇨🇳", 31.3389, 121.2198, "Asia/Shanghai"),
    "suzuka": Circuit("Suzuka International Racing Course", "Suzuka", "Japan", "🇯🇵", 34.8431, 136.5407, "Asia/Tokyo"),
    "sakhir": Circuit("Bahrain International Circuit", "Sakhir", "Bahrain", "🇧🇭", 26.0325, 50.5106, "Asia/Bahrain"),
    "jeddah": Circuit("Jeddah Corniche Circuit", "Jeddah", "Saudi Arabia", "🇸🇦", 21.6319, 39.1044, "Asia/Riyadh"),
    "miami": Circuit("Miami International Autodrome", "Miami", "USA", "🇺🇸", 25.9581, -80.2389, "America/New_York"),
    "montreal": Circuit("Circuit Gilles Villeneuve", "Montreal", "Canada", "🇨🇦", 45.5017, -73.5228, "America/Montreal"),
    "monaco": Circuit("Circuit de Monaco", "Monte Carlo", "Monaco", "🇲🇨", 43.7347, 7.4206, "Europe/Monaco"),
    "barcelona": Circuit("Circuit de Barcelona-Catalunya", "Barcelona", "Spain", "🇪🇸", 41.57, 2.2611, "Europe/Madrid"),
    "spielberg": Circuit("Red Bull Ring", "Spielberg", "Austria", "🇦🇹", 47.2197, 14.7647, "Europe/Vienna"),
    "silverstone": Circuit("Silverstone Circuit", "Silverstone", "UK", "🇬🇧", 52.0786, -1.0169, "Europe/London"),
    "spa": Circuit("Circuit de Spa-Francorchamps", "Spa", "Belgium", "🇧🇪", 50.4372, 5.9714, "Europe/Brussels"),
    "budapest": Circuit("Hungaroring", "Budapest", "Hungary", "🇭🇺", 47.5789, 19.2486, "Europe/Budapest"),
    "zandvoort": Circuit("Circuit Zandvoort", "Zandvoort", "Netherlands", "🇳🇱", 52.3888, 4.5409, "Europe/Amsterdam"),
    "monza": Circuit("Autodromo Nazionale Monza", "Monza", "Italy", "🇮🇹", 45.6156, 9.2811, "Europe/Rome"),
    "madrid": Circuit("Madrid Circuit", "Madrid", "Spain", "🇪🇸", 40.4168, -3.7038, "Europe/Madrid"),
    "baku": Circuit("Baku City Circuit", "Baku", "Azerbaijan", "🇦🇿", 40.3725, 49.8533, "Asia/Baku"),
    "singapore": Circuit("Marina Bay Street Circuit", "Singapore", "Singapore", "🇸🇬", 1.2914, 103.8644, "Asia/Singapore"),
    "austin": Circuit("Circuit of the Americas", "Austin", "USA", "🇺🇸", 30.1328, -97.6411, "America/Chicago"),
    "mexico_city": Circuit("Autodromo Hermanos Rodriguez", "Mexico City", "Mexico", "🇲🇽", 19.4042, -99.0907, "America/Mexico_City"),
    "sao_paulo": Circuit("Autodromo Jose Carlos Pace", "Sao Paulo", "Brazil", "🇧🇷", -23.7014, -46.6969, "America/Sao_Paulo"),
    "las_vegas": Circuit("Las Vegas Strip Circuit", "Las Vegas", "USA", "🇺🇸", 36.1147, -115.1728, "America/Los_Angeles"),
    "lusail": Circuit("Lusail International Circuit", "Lusail", "Qatar", "🇶🇦", 25.49, 51.4542, "Asia/Qatar"),
    "abu_dhabi": Circuit("Yas Marina Circuit", "Abu Dhabi", "UAE", "🇦🇪", 24.4672, 54.6031, "Asia/Dubai"),
}


def get_circuit_by_name(name: str) -> Circuit | None:
    """Look up a circuit by partial name match (case-insensitive)."""
    name_lower = name.lower()
    for key, circuit in CIRCUITS.items():
        if key in name_lower or name_lower in circuit.name.lower() or name_lower in circuit.city.lower():
            return circuit
    return None
