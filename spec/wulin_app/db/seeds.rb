# frozen_string_literal: true

# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the rails db:seed command (or created alongside the database with db:setup).
#
# Examples:
#
#   movies = Movie.create([{ name: 'Star Wars' }, { name: 'Lord of the Rings' }])
#   Character.create(name: 'Luke', movie: movies.first)

JOBS = %w[Developer DevOps Designer PM].freeze

1.upto(2000) do |index|
  Person.create(
    first_name: "first name #{sprintf('%04d', index)}",
    last_name: "last name #{sprintf('%04d', index)}",
    job: JOBS.sample,
    vip: [true, false].sample,
    birthdate: Date.today
  )
end
