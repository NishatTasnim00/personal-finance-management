import ollama
import sys

model = "llama3.2:3b"


class LLMCategorizer:
    def __init__(self, model="llama3.2:3b"):  # Valid model: llama3.2:3b or llama3.1:8b
        self.model = model
        self.categories = [
            "Transportation",
            "food and groceries",
            "Food & Drinks",
            "Bills",
            "Subscription",
            "Health and Fitness",
            "Personal Care",
            "Education",
            "Gifts",
            "Clothing & Shopping",
            "Utility",
            "Entertainment",
            "Rent",
            "EMI/Loan/Insurance",
            "Other",
        ]

        self.system_prompt = f"""
You are an expert expense categorizer for personal finance in India/Bangladesh.
Categorize the transaction description into exactly ONE of these categories:
{', '.join(self.categories)}

Rules:
- Dining out: Restaurants, coffee, snacks, food delivery, food panda, chocolate, juice, etc.
- food and groceries: Supermarket items like vegetables, milk, rice, oil.
- Transportation: Uber, Ola, bus, petrol, auto, taxi.
- Rent: House rent, hostel (e.g., 'basa vara' means home rent in Bengali).
- Gifts: Anything with gift, birthday, festival.
- Utility: Gas, Electricity, Water Bill, WASA
- Entertainment:
- Bills:
- Return ONLY the category name, nothing else. No explanations, no quotes.
"""

        self.few_shot_examples = """
Examples:
Description: Uber ride → Transportation
Description: Starbucks coffee → Food & Drinks
Description: Tuition fee → Education
Description: chocolate → Food & Drinks
Description: gift for friend → Gifts
Description: basa vara → Rent
"""

    def predict(self, description):
        prompt = f"{self.few_shot_examples}\nDescription: {description.strip()}"

        try:
            response = ollama.chat(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": prompt},
                ],
            )
            category = response["message"]["content"].strip()
        except Exception as e:
            sys.stderr.write(f"Error calling Ollama: {e}\n")
            return "Other"

        # Strict fallback
        if category not in self.categories:
            return "Other"

        return category


# --- Test it ---
if __name__ == "__main__":

    categorizer = LLMCategorizer(model)

    test_cases = [
        "Uber ride",
        "Starbucks",
        "Tuition fee",
        "chocolate",
        "gift for friend",
        "Basa vara",
        "Netflix subscription",
        "parlour",
        "body lotion",
        "sweater",
    ]

    print("Predictions:")
    for t in test_cases:
        pred = categorizer.predict(t)
        print(f"'{t}' -> {pred}")