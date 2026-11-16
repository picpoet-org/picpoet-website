import 'dart:convert';
import 'dart:io';
import 'package:pinyin/pinyin.dart';

void main(List<String> args) {
  final source = File(args.single).readAsStringSync();
  final names = RegExp(r'"([^"\n]+)"').allMatches(source).map((m) => m[1]!);
  stdout.write(jsonEncode([
    for (final name in names)
      [name, ChineseHelper.convertToTraditionalChinese(name)],
  ]));
}
