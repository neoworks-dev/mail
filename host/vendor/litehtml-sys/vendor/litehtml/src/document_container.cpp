#include "utf8_strings.h"
#include "document_container.h"

// neoworks: a word this long is almost always a URL; it may break after URL punctuation so it
// wraps inside the reading pane instead of running past it.
static const size_t long_word_length = 20;

static bool is_url_break_character(char32_t c)
{
	return c == '/' || c == '?' || c == '&' || c == '=' || c == '.' || c == '-' || c == '_' || c == '#';
}

static void emit_word(const std::u32string& word, const std::function<void(const char*)>& on_word)
{
	if (word.length() < long_word_length)
	{
		on_word(litehtml::utf32_to_utf8(word));
		return;
	}
	std::u32string piece;
	for (auto c : word)
	{
		piece += c;
		if (is_url_break_character(c))
		{
			on_word(litehtml::utf32_to_utf8(piece));
			piece.clear();
		}
	}
	if (!piece.empty())
	{
		on_word(litehtml::utf32_to_utf8(piece));
	}
}

void litehtml::document_container::split_text(const char* text, const std::function<void(const char*)>& on_word, const std::function<void(const char*)>& on_space)
{
	std::u32string str;
	std::u32string str_in = (const char32_t*)utf8_to_utf32(text);
	for (auto c : str_in)
	{
		if (c <= ' ' && (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f'))
		{
			if (!str.empty())
			{
				emit_word(str, on_word);
				str.clear();
			}
			str += c;
			on_space(utf32_to_utf8(str));
			str.clear();
		}
		// CJK character range
		else if (c >= 0x4E00 && c <= 0x9FCC)
		{
			if (!str.empty())
			{
				emit_word(str, on_word);
				str.clear();
			}
			str += c;
			on_word(utf32_to_utf8(str));
			str.clear();
		}
		else
		{
			str += c;
		}
	}
	if (!str.empty())
	{
		emit_word(str, on_word);
	}
}
