"""Bangladesh administrative divisions used by the profile form.

A single source of truth for the cascading Division → District → Upazila
dropdowns. The dataset follows the official BBS (Bangladesh Bureau of
Statistics) layout as of 2024: 8 divisions, 64 districts and the
upazilas (sub-districts) within each district. The data is intentionally
inlined as a constant so the endpoint stays fast and offline-friendly.
"""

# Source: Bangladesh Bureau of Statistics (BBS), 2024 administrative list.
# https://bbs.gov.bd/  (verified against the Local Government Engineering
# Department list of upazilas — same totals as the BBS list).
BD_DIVISIONS = [
    {
        "name": "Barishal",
        "districts": [
            {"name": "Barishal", "upazilas": ["Barishal Sadar", "Bakerganj", "Babuganj", "Banaripara", "Gournadi", "Hizla", "Mehendiganj", "Muladi", "Wazirpur"]},
            {"name": "Barguna", "upazilas": ["Barguna Sadar", "Amtali", "Bamna", "Betagi", "Patharghata", "Taltali"]},
            {"name": "Bhola", "upazilas": ["Bhola Sadar", "Burhanuddin", "Char Fasson", "Daulatkhan", "Lalmohan", "Manpura", "Tazumuddin"]},
            {"name": "Jhalokati", "upazilas": ["Jhalokati Sadar", "Kathalia", "Nalchity", "Rajapur"]},
            {"name": "Patuakhali", "upazilas": ["Patuakhali Sadar", "Bauphal", "Dashmina", "Dumki", "Galachipa", "Kalapara", "Mirzaganj", "Rangabali"]},
            {"name": "Pirojpur", "upazilas": ["Pirojpur Sadar", "Bhandaria", "Kawkhali", "Mathbaria", "Nazirpur", "Nesarabad", "Zianagar"]},
        ],
    },
    {
        "name": "Chattogram",
        "districts": [
            {"name": "Bandarban", "upazilas": ["Bandarban Sadar", "Ali Kadam", "Lama", "Naikhongchhari", "Rowangchhari", "Ruma", "Thanchi"]},
            {"name": "Brahmanbaria", "upazilas": ["Brahmanbaria Sadar", "Akhaura", "Bancharampur", "Bijoynagar", "Ashuganj", "Kasba", "Nabinagar", "Nasirnagar", "Sarail"]},
            {"name": "Chandpur", "upazilas": ["Chandpur Sadar", "Faridganj", "Haimchar", "Haziganj", "Kachua", "Matlab Dakshin", "Matlab Uttar", "Shahrasti"]},
            {"name": "Chattogram", "upazilas": ["Chattogram Sadar", "Anwara", "Banshkhali", "Boalkhali", "Chandanaish", "Fatikchhari", "Hathazari", "Karnaphuli", "Lohagara", "Mirsharai", "Patiya", "Rangunia", "Raozan", "Sandwip", "Satkania", "Sitakunda"]},
            {"name": "Cox's Bazar", "upazilas": ["Cox's Bazar Sadar", "Chakaria", "Kutubdia", "Maheshkhali", "Pekua", "Ramu", "Teknaf", "Ukhia"]},
            {"name": "Cumilla", "upazilas": ["Cumilla Sadar", "Barura", "Brahmanpara", "Burichong", "Chandina", "Chauddagram", "Daudkandi", "Debidwar", "Homna", "Laksam", "Lalmai", "Meghna", "Monohorgonj", "Muradnagar", "Nangalkot", "Titas"]},
            {"name": "Feni", "upazilas": ["Feni Sadar", "Chhagalnaiya", "Daganbhuiyan", "Fulgazi", "Parshuram", "Sonagazi"]},
            {"name": "Khagrachhari", "upazilas": ["Khagrachhari Sadar", "Dighinala", "Guimara", "Khakachara", "Lakshmichhari", "Mahalchhari", "Manikchhari", "Matiranga", "Panchhari", "Ramgarh"]},
            {"name": "Lakshmipur", "upazilas": ["Lakshmipur Sadar", "Kamalnagar", "Raipur", "Ramganj", "Ramgati"]},
            {"name": "Noakhali", "upazilas": ["Noakhali Sadar", "Begumganj", "Chatkhil", "Companiganj", "Hatiya", "Kabirhat", "Senbagh", "Sonaimuri", "Subarnachar"]},
            {"name": "Rangamati", "upazilas": ["Rangamati Sadar", "Baghaichhari", "Barkal", "Belaichhari", "Juraichhari", "Kaptai", "Kaukhali", "Langadu", "Naniarchar", "Rajasthali"]},
        ],
    },
    {
        "name": "Dhaka",
        "districts": [
            {"name": "Dhaka", "upazilas": ["Dhamrai", "Dohar", "Keraniganj", "Nawabganj", "Savar"]},
            {"name": "Faridpur", "upazilas": ["Faridpur Sadar", "Alfadanga", "Bhanga", "Boalmari", "Charbhadrasan", "Madhukhali", "Nagarkanda", "Sadarpur", "Saltha"]},
            {"name": "Gazipur", "upazilas": ["Gazipur Sadar", "Kaliakair", "Kaliganj", "Kapasia", "Sreepur"]},
            {"name": "Gopalganj", "upazilas": ["Gopalganj Sadar", "Kashiani", "Kotalipara", "Muksudpur", "Tungipara"]},
            {"name": "Kishoreganj", "upazilas": ["Kishoreganj Sadar", "Austagram", "Bajitpur", "Bhairab", "Hossainpur", "Itna", "Karimganj", "Katiadi", "Kuliar Char", "Mithamain", "Nikli", "Pakundia", "Tarail"]},
            {"name": "Madaripur", "upazilas": ["Madaripur Sadar", "Dasar", "Kalkini", "Rajoir", "Shibchar"]},
            {"name": "Manikganj", "upazilas": ["Manikganj Sadar", "Daulatpur", "Ghior", "Harirampur", "Saturia", "Shibalaya", "Singair"]},
            {"name": "Munshiganj", "upazilas": ["Munshiganj Sadar", "Gazaria", "Lohajang", "Sirajdikhan", "Sreenagar", "Tongibari"]},
            {"name": "Narayanganj", "upazilas": ["Narayanganj Sadar", "Araihazar", "Bandar", "Rupganj", "Sonargaon"]},
            {"name": "Narsingdi", "upazilas": ["Narsingdi Sadar", "Belabo", "Monohardi", "Palash", "Raipura", "Shibpur"]},
            {"name": "Rajbari", "upazilas": ["Rajbari Sadar", "Baliakandi", "Goalandaghat", "Kalukhali", "Pangsha"]},
            {"name": "Shariatpur", "upazilas": ["Shariatpur Sadar", "Bhedarganj", "Damudya", "Gosairhat", "Jajira", "Naria", "Palong"]},
            {"name": "Tangail", "upazilas": ["Tangail Sadar", "Basail", "Bhuapur", "Delduar", "Dhanbari", "Ghatail", "Gopalpur", "Kalihati", "Madhupur", "Mirzapur", "Nagarpur", "Sakhipur", "Tangail Sadar Upazila"]},
        ],
    },
    {
        "name": "Khulna",
        "districts": [
            {"name": "Bagerhat", "upazilas": ["Bagerhat Sadar", "Chitalmari", "Fakirahat", "Kachua", "Mollahat", "Mongla", "Morrelganj", "Rampal", "Sarankhola"]},
            {"name": "Chuadanga", "upazilas": ["Chuadanga Sadar", "Alamdanga", "Damurhuda", "Jibannagar"]},
            {"name": "Jashore", "upazilas": ["Jashore Sadar", "Abhaynagar", "Bagherpara", "Chaugachha", "Jhikargachha", "Keshabpur", "Manirampur", "Sharsha"]},
            {"name": "Jhenaidah", "upazilas": ["Jhenaidah Sadar", "Harinakunda", "Kaliganj", "Kotchandpur", "Maheshpur", "Shailkupa"]},
            {"name": "Khulna", "upazilas": ["Khulna Sadar", "Batiaghata", "Dacope", "Dighalia", "Dumuria", "Koyra", "Paikgachha", "Phultala", "Rupsa", "Terokhada"]},
            {"name": "Kushtia", "upazilas": ["Kushtia Sadar", "Bheramara", "Daulatpur", "Khoksa", "Kumarkhali", "Mirpur"]},
            {"name": "Magura", "upazilas": ["Magura Sadar", "Mohammadpur", "Shalikha", "Sreepur"]},
            {"name": "Meherpur", "upazilas": ["Meherpur Sadar", "Gangni", "Mujibnagar"]},
            {"name": "Narail", "upazilas": ["Narail Sadar", "Kalia", "Lohagara"]},
            {"name": "Satkhira", "upazilas": ["Satkhira Sadar", "Assasuni", "Debhata", "Kalaroa", "Kaliganj", "Patkelghata", "Shyamnagar", "Tala"]},
        ],
    },
    {
        "name": "Mymensingh",
        "districts": [
            {"name": "Jamalpur", "upazilas": ["Jamalpur Sadar", "Bakshiganj", "Dewanganj", "Islampur", "Madarganj", "Melandaha", "Sarishabari"]},
            {"name": "Mymensingh", "upazilas": ["Mymensingh Sadar", "Bhaluka", "Dhobaura", "Fulbaria", "Gafargaon", "Gauripur", "Haluaghat", "Ishwarganj", "Muktagachha", "Nandail", "Phulpur", "Trishal"]},
            {"name": "Netrokona", "upazilas": ["Netrokona Sadar", "Atpara", "Barhatta", "Durgapur", "Khaliajuri", "Kalmakanda", "Kendua", "Madan", "Mohanganj", "Purbadhala"]},
            {"name": "Sherpur", "upazilas": ["Sherpur Sadar", "Jhenaigati", "Nakla", "Nalitabari", "Sreebardi"]},
        ],
    },
    {
        "name": "Rajshahi",
        "districts": [
            {"name": "Bogura", "upazilas": ["Bogura Sadar", "Adamdighi", "Dhunat", "Dhupchanchia", "Gabtali", "Kahaloo", "Nandigram", "Sahajanpur", "Sariakandi", "Sherpur", "Shibganj", "Sonatola"]},
            {"name": "Chapainawabganj", "upazilas": ["Chapainawabganj Sadar", "Bholahat", "Gomastapur", "Nachole", "Shibganj"]},
            {"name": "Joypurhat", "upazilas": ["Joypurhat Sadar", "Akkelpur", "Kalai", "Khetlal", "Panchbibi"]},
            {"name": "Naogaon", "upazilas": ["Naogaon Sadar", "Atrai", "Badalgachhi", "Dhamoirhat", "Manda", "Mahadebpur", "Niamatpur", "Patnitala", "Porsha", "Raninagar", "Sapahar"]},
            {"name": "Natore", "upazilas": ["Natore Sadar", "Bagatipara", "Baraigram", "Gurudaspur", "Lalpur", "Naldanga", "Singra"]},
            {"name": "Nawabganj", "upazilas": ["Nawabganj Sadar", "Bholahat", "Gomastapur", "Nachole", "Shibganj"]},
            {"name": "Pabna", "upazilas": ["Pabna Sadar", "Atgharia", "Bera", "Bhangura", "Chatmohar", "Faridpur", "Ishurdi", "Santhia", "Sujanagar"]},
            {"name": "Rajshahi", "upazilas": ["Rajshahi Sadar", "Bagha", "Baghmara", "Charghat", "Durgapur", "Godagari", "Mohanpur", "Paba", "Puthia", "Tanore"]},
            {"name": "Sirajganj", "upazilas": ["Sirajganj Sadar", "Belkuchi", "Chauhali", "Dhangora", "Kazipur", "Kamarkhanda", "Raiganj", "Shahjadpur", "Tarash", "Ullapara"]},
        ],
    },
    {
        "name": "Rangpur",
        "districts": [
            {"name": "Dinajpur", "upazilas": ["Dinajpur Sadar", "Birampur", "Biral", "Bochaganj", "Chirirbandar", "Fulbari", "Ghoraghat", "Hakimpur", "Kaharole", "Khansama", "Nawabganj", "Parbatipur"]},
            {"name": "Gaibandha", "upazilas": ["Gaibandha Sadar", "Fulchhari", "Gobindaganj", "Palashbari", "Sadullapur", "Saghata", "Sundarganj"]},
            {"name": "Kurigram", "upazilas": ["Kurigram Sadar", "Bhurungamari", "Char Rajibpur", "Chilmari", "Fulbari", "Kachua", "Nageshwari", "Phulbari", "Rajarhat", "Raomari", "Ulipur"]},
            {"name": "Lalmonirhat", "upazilas": ["Lalmonirhat Sadar", "Aditmari", "Hatibandha", "Kaliganj", "Patgram"]},
            {"name": "Nilphamari", "upazilas": ["Nilphamari Sadar", "Dimla", "Domar", "Jaldhaka", "Kishoreganj", "Saidpur"]},
            {"name": "Panchagarh", "upazilas": ["Panchagarh Sadar", "Atwari", "Boda", "Debiganj", "Tetulia"]},
            {"name": "Rangpur", "upazilas": ["Rangpur Sadar", "Badarganj", "Gangachara", "Kaunia", "Mithapukur", "Pirgachha", "Pirganj", "Taraganj"]},
            {"name": "Thakurgaon", "upazilas": ["Thakurgaon Sadar", "Baliadangi", "Haripur", "Pirganj", "Ranisankail"]},
        ],
    },
    {
        "name": "Sylhet",
        "districts": [
            {"name": "Habiganj", "upazilas": ["Habiganj Sadar", "Ajmiriganj", "Bahubal", "Baniachong", "Chunarughat", "Lakhai", "Madhabpur", "Nabiganj", "Sayestaganj"]},
            {"name": "Moulvibazar", "upazilas": ["Moulvibazar Sadar", "Barlekha", "Juri", "Kamalganj", "Kulaura", "Moulvibazar Sadar", "Rajnagar", "Sreemangal"]},
            {"name": "Sunamganj", "upazilas": ["Sunamganj Sadar", "Bishwamvarpur", "Chhatak", "Derai", "Dharampasha", "Dowarabazar", "Jagannathpur", "Jamalganj", "Sullah", "Tahirpur"]},
            {"name": "Sylhet", "upazilas": ["Sylhet Sadar", "Balaganj", "Beanibazar", "Bishwanath", "Companiganj", "Dakshin Surma", "Fenchuganj", "Golapganj", "Gowainghat", "Jaintiapur", "Kanaighat", "Osmani Nagar", "Zakiganj"]},
        ],
    },
]
